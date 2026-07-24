import { eq } from "drizzle-orm";
import { getDb, orders, type Order } from "../db/index.js";
import { centsToMoney } from "../pay/sign.js";

export async function markOrderPaid(opts: {
  tradeNo: string;
  channelTradeNo?: string;
  amountCents: number;
}): Promise<{ order: Order; alreadyPaid: boolean } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.tradeNo, opts.tradeNo))
    .limit(1);

  const order = rows[0];
  if (!order) return null;

  if (order.amountCents !== opts.amountCents) {
    throw Object.assign(
      new Error(
        `amount mismatch: expected ${centsToMoney(order.amountCents)} got ${centsToMoney(opts.amountCents)}`,
      ),
      { code: "AMOUNT_MISMATCH" },
    );
  }

  if (order.status === "paid") {
    return { order, alreadyPaid: true };
  }

  const now = Date.now();
  const updated = await db
    .update(orders)
    .set({
      status: "paid",
      paidAt: now,
      channelTradeNo: opts.channelTradeNo ?? order.channelTradeNo,
      notifyStatus:
        order.notifyStatus === "ok" ? "ok" : "pending",
      updatedAt: now,
    })
    .where(eq(orders.id, order.id))
    .returning();

  // Fire merchant notify ASAP (worker also sweeps periodically).
  try {
    const { processNotifyOrder } = await import("./notify.js");
    void processNotifyOrder(updated[0]);
  } catch {
    // non-fatal; retry worker will pick up pending/retrying
  }

  return { order: updated[0], alreadyPaid: false };
}

export async function attachChannelPayInfo(opts: {
  tradeNo: string;
  payurl: string;
  qrcode: string;
  channelTradeNo?: string;
}): Promise<Order | null> {
  const db = getDb();
  const now = Date.now();
  const updated = await db
    .update(orders)
    .set({
      payUrl: opts.payurl,
      qrCode: opts.qrcode,
      channelTradeNo: opts.channelTradeNo ?? null,
      updatedAt: now,
    })
    .where(eq(orders.tradeNo, opts.tradeNo))
    .returning();
  return updated[0] ?? null;
}
