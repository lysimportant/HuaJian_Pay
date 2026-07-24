import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, merchants, notifyAttempts, orders, type Order } from "../db/index.js";
import { centsToMoney, signMd5 } from "./sign.js";

const MAX_ATTEMPTS = 8;
/** Retry delays in seconds (epay-like backoff) */
const RETRY_DELAYS_SEC = [0, 15, 60, 300, 600, 1800, 3600, 7200];
const inFlightNotifyOrderIds = new Set<number>();

type ProcessNotifyOptions = {
  force?: boolean;
};

type ProcessNotifyResult = {
  processed: boolean;
  reason?: string;
  attemptNo?: number;
  httpStatus?: number | null;
  responseBody?: string;
  success?: boolean;
  nextRetryAt?: number | null;
  notifyStatus?: Order["notifyStatus"];
};

function nextDelaySec(attemptNo: number): number {
  return RETRY_DELAYS_SEC[Math.min(attemptNo, RETRY_DELAYS_SEC.length - 1)] ?? 7200;
}

export function buildMerchantNotifyParams(order: Order, pid: string, apiKey: string) {
  const params: Record<string, string | number> = {
    pid,
    trade_no: order.tradeNo,
    out_trade_no: order.outTradeNo,
    type: order.channel,
    name: order.name,
    money: centsToMoney(order.amountCents),
    trade_status: "TRADE_SUCCESS",
    param: order.param || "",
  };
  const sign = signMd5(params, apiKey);
  return {
    ...params,
    sign,
    sign_type: "MD5",
  };
}

async function postNotify(
  url: string,
  params: Record<string, string | number>,
): Promise<{ status: number; body: string }> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    body.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 2000) };
  } finally {
    clearTimeout(timer);
  }
}

function isSuccessBody(body: string): boolean {
  return body.trim().toLowerCase() === "success";
}

export async function enqueueMerchantNotify(orderId: number): Promise<void> {
  const db = getDb();
  await db
    .update(orders)
    .set({
      notifyStatus: "pending",
      updatedAt: Date.now(),
    })
    .where(eq(orders.id, orderId));
}

export async function processNotifyOrder(
  order: Order,
  options: ProcessNotifyOptions = {},
): Promise<ProcessNotifyResult> {
  if (inFlightNotifyOrderIds.has(order.id)) {
    return { processed: false, reason: "in_progress" };
  }

  inFlightNotifyOrderIds.add(order.id);
  try {
    return await processNotifyOrderUnlocked(order, options);
  } finally {
    inFlightNotifyOrderIds.delete(order.id);
  }
}

async function processNotifyOrderUnlocked(
  order: Order,
  options: ProcessNotifyOptions,
): Promise<ProcessNotifyResult> {
  const db = getDb();
  if (!order.notifyUrl) {
    await db
      .update(orders)
      .set({ notifyStatus: "failed", updatedAt: Date.now() })
      .where(eq(orders.id, order.id));
    return { processed: false, reason: "missing_notify_url", notifyStatus: "failed" };
  }

  const merchantRows = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, order.merchantId))
    .limit(1);
  const merchant = merchantRows[0];
  if (!merchant) {
    await db
      .update(orders)
      .set({ notifyStatus: "failed", updatedAt: Date.now() })
      .where(eq(orders.id, order.id));
    return { processed: false, reason: "missing_merchant", notifyStatus: "failed" };
  }

  const attemptRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifyAttempts)
    .where(eq(notifyAttempts.orderId, order.id));
  const attemptNo = Number(attemptRows[0]?.n ?? 0) + 1;

  if (attemptNo > MAX_ATTEMPTS && !options.force) {
    await db
      .update(orders)
      .set({ notifyStatus: "failed", updatedAt: Date.now() })
      .where(eq(orders.id, order.id));
    return {
      processed: false,
      reason: "max_attempts_reached",
      attemptNo,
      notifyStatus: "failed",
    };
  }

  const params = buildMerchantNotifyParams(order, merchant.pid, merchant.apiKey);
  let status = 0;
  let body = "";
  let success = false;

  try {
    const res = await postNotify(order.notifyUrl, params);
    status = res.status;
    body = res.body;
    success = status >= 200 && status < 300 && isSuccessBody(body);
  } catch (err) {
    body = err instanceof Error ? err.message : String(err);
    success = false;
  }

  const now = Date.now();
  const nextRetryAt = success ? null : now + nextDelaySec(attemptNo) * 1000;

  await db.insert(notifyAttempts).values({
    orderId: order.id,
    attemptNo,
    httpStatus: status || null,
    responseBody: body,
    success,
    nextRetryAt,
    createdAt: now,
  });

  await db
    .update(orders)
    .set({
      notifyStatus: success
        ? "ok"
        : attemptNo >= MAX_ATTEMPTS
          ? "failed"
          : "retrying",
      updatedAt: now,
    })
    .where(eq(orders.id, order.id));

  return {
    processed: true,
    attemptNo,
    httpStatus: status || null,
    responseBody: body,
    success,
    nextRetryAt,
    notifyStatus: success
      ? "ok"
      : attemptNo >= MAX_ATTEMPTS
        ? "failed"
        : "retrying",
  };
}

export async function resendMerchantNotify(tradeNo: string): Promise<{
  ok: boolean;
  reason?: string;
  order?: Pick<Order, "tradeNo" | "status" | "notifyStatus">;
  attempt?: ProcessNotifyResult;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.tradeNo, tradeNo))
    .limit(1);
  const order = rows[0];
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.status !== "paid") {
    return {
      ok: false,
      reason: "order_not_paid",
      order: {
        tradeNo: order.tradeNo,
        status: order.status,
        notifyStatus: order.notifyStatus,
      },
    };
  }

  const attempt = await processNotifyOrder(order, { force: true });
  if (!attempt.processed) {
    return {
      ok: false,
      reason: attempt.reason,
      order: {
        tradeNo: order.tradeNo,
        status: order.status,
        notifyStatus: attempt.notifyStatus ?? order.notifyStatus,
      },
      attempt,
    };
  }

  return {
    ok: true,
    order: {
      tradeNo: order.tradeNo,
      status: order.status,
      notifyStatus: attempt.notifyStatus ?? order.notifyStatus,
    },
    attempt,
  };
}

export async function runNotifySweep(limit = 20): Promise<number> {
  const db = getDb();
  const now = Date.now();

  // Candidates: paid + notify pending/retrying
  const candidates = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        inArray(orders.notifyStatus, ["pending", "retrying"]),
      ),
    )
    .limit(limit * 3);

  let processed = 0;
  for (const order of candidates) {
    if (processed >= limit) break;

    if (order.notifyStatus === "retrying") {
      // Only retry when last attempt next_retry_at is due.
      const last = await db
        .select()
        .from(notifyAttempts)
        .where(eq(notifyAttempts.orderId, order.id))
        .orderBy(sql`${notifyAttempts.attemptNo} desc`)
        .limit(1);
      const next = last[0]?.nextRetryAt;
      if (next && next > now) continue;
    }

    await processNotifyOrder(order);
    processed += 1;
  }

  return processed;
}

let timer: NodeJS.Timeout | null = null;

export function startNotifyWorker(intervalMs = 5000): void {
  if (timer) return;
  timer = setInterval(() => {
    void runNotifySweep().catch((err) => {
      console.error("[notify-worker]", err);
    });
  }, intervalMs);
  // Don't keep process alive solely because of the timer in tests.
  if (typeof timer.unref === "function") timer.unref();
}

export function stopNotifyWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
