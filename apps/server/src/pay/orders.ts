import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getAlipayChannel } from "../channels/index.js";
import { env } from "../config/env.js";
import { getDb, merchants, orders, type Order } from "../db/index.js";
import { centsToMoney, moneyToCents } from "./sign.js";

export type CreateOrderInput = {
  pid: string;
  type: "alipay" | "wxpay";
  outTradeNo: string;
  notifyUrl: string;
  returnUrl?: string;
  name: string;
  money: string;
  param?: string;
  clientIp?: string;
};

export type CreateOrderResult = {
  order: Order;
  payurl: string;
  qrcode: string;
};

function generateTradeNo(): string {
  const ts = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const rand = randomBytes(4).toString("hex");
  return `${stamp}${rand}`;
}

export async function findMerchantByPid(pid: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(merchants)
    .where(eq(merchants.pid, pid))
    .limit(1);
  return rows[0] ?? null;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const merchant = await findMerchantByPid(input.pid);
  if (!merchant || merchant.status !== "active") {
    throw Object.assign(new Error("merchant not found or disabled"), {
      code: -1,
    });
  }

  if (input.type !== "alipay" && input.type !== "wxpay") {
    throw Object.assign(new Error("unsupported type"), { code: -2 });
  }

  if (input.type === "wxpay") {
    // Interface reserved; live WeChat is out of scope for Alipay MVP.
    throw Object.assign(new Error("wxpay not enabled in MVP"), { code: -2 });
  }

  const amountCents = moneyToCents(input.money);
  const tradeNo = generateTradeNo();
  const now = Date.now();
  const expiredAt = now + 30 * 60 * 1000;

  const db = getDb();
  let order: Order;
  try {
    const inserted = await db
      .insert(orders)
      .values({
        tradeNo,
        outTradeNo: input.outTradeNo,
        merchantId: merchant.id,
        channel: input.type,
        name: input.name,
        amountCents,
        status: "pending",
        notifyStatus: "none",
        notifyUrl: input.notifyUrl,
        returnUrl: input.returnUrl ?? "",
        param: input.param ?? "",
        clientIp: input.clientIp ?? null,
        payUrl: "",
        qrCode: "",
        expiredAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    order = inserted[0];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("unique")) {
      throw Object.assign(new Error("out_trade_no already exists"), {
        code: -3,
      });
    }
    throw err;
  }

  try {
    const channel = await getAlipayChannel();
    const pre = await channel.precreate({
      order,
      subject: input.name,
      notifyUrl: env.alipayNotifyUrl || `${env.appUrl}/channels/alipay/notify`,
      returnUrl: input.returnUrl || env.alipayReturnUrl || env.appUrl,
    });

    const updated = await db
      .update(orders)
      .set({
        payUrl: pre.payurl,
        qrCode: pre.qrcode,
        channelTradeNo: pre.channelTradeNo ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    order = updated[0];
    return { order, payurl: pre.payurl, qrcode: pre.qrcode };
  } catch (err) {
    // Keep pending order for investigation; surface channel error to API.
    const message = err instanceof Error ? err.message : "channel precreate failed";
    throw Object.assign(new Error(message), { code: -4 });
  }
}

export async function queryOrderByOutTradeNo(pid: string, outTradeNo: string) {
  const merchant = await findMerchantByPid(pid);
  if (!merchant) return null;

  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchant.id),
        eq(orders.outTradeNo, outTradeNo),
      ),
    )
    .limit(1);

  return rows[0] ? { order: rows[0], merchant } : null;
}

export async function queryOrderByTradeNo(tradeNo: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.tradeNo, tradeNo))
    .limit(1);
  return rows[0] ?? null;
}

export function orderToPublic(order: Order, pid: string) {
  return {
    trade_no: order.tradeNo,
    out_trade_no: order.outTradeNo,
    pid,
    type: order.channel,
    name: order.name,
    money: centsToMoney(order.amountCents),
    status: order.status === "paid" ? 1 : 0,
    trade_status:
      order.status === "paid" ? "TRADE_SUCCESS" : "TRADE_PENDING",
    param: order.param,
    payurl: order.payUrl ?? "",
    qrcode: order.qrCode ?? "",
    addtime: order.createdAt,
    endtime: order.paidAt ?? 0,
  };
}
