import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createOrder,
  findMerchantByPid,
  orderToPublic,
  queryOrderByOutTradeNo,
  queryOrderByTradeNo,
} from "../pay/orders.js";
import { renderPayPage, escapeHtml } from "../pay/pay-page.js";
import { centsToMoney, verifyMd5, type SignParams } from "../pay/sign.js";

type AnyRecord = Record<string, unknown>;

function asString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function collectParams(req: FastifyRequest): SignParams {
  const body =
    req.body && typeof req.body === "object" ? (req.body as AnyRecord) : {};
  const query =
    req.query && typeof req.query === "object" ? (req.query as AnyRecord) : {};
  const merged: SignParams = {};
  for (const [k, v] of Object.entries({ ...query, ...body })) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") continue;
    merged[k] = String(v);
  }
  return merged;
}

function fail(code: number, msg: string) {
  return { code, msg };
}

function publicStatus(status: string, expiredAt: number | null): string {
  if (status === "pending" && expiredAt !== null && expiredAt <= Date.now()) {
    return "expired";
  }
  return status;
}

async function handleCreate(req: FastifyRequest, mode: "mapi" | "submit") {
  const params = collectParams(req);
  const pid = asString(params.pid);
  const type = asString(params.type) as "alipay" | "wxpay";
  const outTradeNo = asString(params.out_trade_no);
  const notifyUrl = asString(params.notify_url);
  const returnUrl = asString(params.return_url);
  const name = asString(params.name);
  const money = asString(params.money);
  const param = asString(params.param);
  const signType = asString(params.sign_type || "MD5").toUpperCase();

  if (!pid || !outTradeNo || !notifyUrl || !name || !money || !type) {
    return fail(-1, "missing required fields");
  }
  if (signType !== "MD5") {
    return fail(-1, "only MD5 sign_type supported");
  }

  const merchant = await findMerchantByPid(pid);
  if (!merchant || merchant.status !== "active") {
    return fail(-1, "merchant not found or disabled");
  }
  if (!verifyMd5(params, merchant.apiKey)) {
    return fail(-2, "sign error");
  }

  try {
    const result = await createOrder({
      pid,
      type,
      outTradeNo,
      notifyUrl,
      returnUrl: returnUrl || undefined,
      name,
      money,
      param: param || undefined,
      clientIp: req.ip,
    });

    if (mode === "submit") {
      const html = renderPayPage({
        tradeNo: result.order.tradeNo,
        outTradeNo: result.order.outTradeNo,
        name: result.order.name,
        amount: money.includes(".") ? money : centsToMoney(result.order.amountCents),
        type: result.order.channel,
        status: publicStatus(result.order.status, result.order.expiredAt),
        payUrl: result.payurl,
        qrUrl: result.qrcode || result.payurl,
        returnUrl: result.order.returnUrl || returnUrl || "",
        expiredAt: result.order.expiredAt,
        paidAt: result.order.paidAt,
      });
      return { __html: html };
    }

    return {
      code: 1,
      msg: "success",
      trade_no: result.order.tradeNo,
      payurl: result.payurl,
      qrcode: result.qrcode,
    };
  } catch (err) {
    const e = err as { code?: number; message?: string };
    return fail(e.code ?? -1, e.message ?? "create order failed");
  }
}

async function handleQuery(req: FastifyRequest) {
  const params = collectParams(req);
  const act = asString(params.act || "order");
  if (act !== "order") {
    return fail(-1, "unsupported act");
  }

  const pid = asString(params.pid);
  const outTradeNo = asString(params.out_trade_no);
  const key = asString(params.key);

  if (!pid || !outTradeNo) {
    return fail(-1, "missing pid or out_trade_no");
  }

  const merchant = await findMerchantByPid(pid);
  if (!merchant || merchant.status !== "active") {
    return fail(-1, "merchant not found or disabled");
  }

  // Classic api.php uses pid+key; also accept signed variant.
  const authorized =
    (key && key === merchant.apiKey) || verifyMd5(params, merchant.apiKey);
  if (!authorized) {
    return fail(-2, "auth error");
  }

  const found = await queryOrderByOutTradeNo(pid, outTradeNo);
  if (!found) {
    return fail(-1, "order not found");
  }

  return {
    code: 1,
    msg: "success",
    ...orderToPublic(found.order, pid),
  };
}

async function handlePublicPayPage(
  req: FastifyRequest<{ Params: { tradeNo: string } }>,
) {
  const tradeNo = String(req.params.tradeNo ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(tradeNo)) {
    return {
      __html: renderPayPage({
        tradeNo: tradeNo || "",
        name: "订单支付",
        amount: "0.00",
        type: "alipay",
        status: "error",
        errorMessage: "订单号无效",
        skipPoll: true,
      }),
    };
  }

  const order = await queryOrderByTradeNo(tradeNo);
  if (!order) {
    return {
      __html: renderPayPage({
        tradeNo,
        name: "订单支付",
        amount: "0.00",
        type: "alipay",
        status: "error",
        errorMessage: "订单不存在或已失效",
        skipPoll: false,
      }),
    };
  }

  const amount = centsToMoney(order.amountCents);
  const html = renderPayPage({
    tradeNo: order.tradeNo,
    outTradeNo: order.outTradeNo,
    name: order.name,
    amount,
    type: order.channel,
    status: publicStatus(order.status, order.expiredAt),
    payUrl: order.payUrl ?? "",
    qrUrl: order.qrCode ?? order.payUrl ?? "",
    returnUrl: order.returnUrl ?? "",
    expiredAt: order.expiredAt,
    paidAt: order.paidAt,
  });
  return { __html: html };
}

export async function payRoutes(app: FastifyInstance): Promise<void> {
  // Classic YiPay-compatible
  app.all("/submit.php", async (req, reply) => {
    const result = await handleCreate(req, "submit");
    if (result && typeof result === "object" && "__html" in result) {
      return reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Robots-Tag", "noindex, nofollow, noarchive")
        .send((result as { __html: string }).__html);
    }
    return reply.send(result);
  });

  app.all("/mapi.php", async (req) => handleCreate(req, "mapi"));

  app.all("/api.php", async (req) => handleQuery(req));

  // Modern REST aliases
  app.post("/api/v1/pay/submit", async (req, reply) => {
    const result = await handleCreate(req, "submit");
    if (result && typeof result === "object" && "__html" in result) {
      return reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Robots-Tag", "noindex, nofollow, noarchive")
        .send((result as { __html: string }).__html);
    }
    return reply.send(result);
  });

  app.post("/api/v1/pay/create", async (req) => handleCreate(req, "mapi"));

  app.get("/api/v1/order/query", async (req) => handleQuery(req));

  // Public payer page by platform trade_no
  app.get<{ Params: { tradeNo: string } }>(
    "/pay/:tradeNo",
    async (req, reply) => {
      const result = await handlePublicPayPage(req);
      return reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Robots-Tag", "noindex, nofollow, noarchive")
        .send(result.__html);
    },
  );

  app.get<{ Params: { tradeNo: string } }>(
    "/pay/:tradeNo/result",
    async (req, reply) => {
      const result = await handlePublicPayPage(req);
      return reply
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Robots-Tag", "noindex, nofollow, noarchive")
        .send(result.__html);
    },
  );
}

// re-export escapeHtml for any legacy imports / tests
export { escapeHtml };
