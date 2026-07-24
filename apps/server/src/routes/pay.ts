import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createOrder,
  findMerchantByPid,
  orderToPublic,
  queryOrderByOutTradeNo,
} from "../pay/orders.js";
import { verifyMd5, type SignParams } from "../pay/sign.js";

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
      // Simple HTML pay page for classic page-submit compatibility.
      const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Pay</title></head>
<body>
  <h3>${escapeHtml(name)}</h3>
  <p>金额：${escapeHtml(money)} 元</p>
  <p>平台单号：${escapeHtml(result.order.tradeNo)}</p>
  <p><a href="${escapeHtml(result.payurl)}">继续支付</a></p>
  <p>或使用二维码链接：${escapeHtml(result.qrcode)}</p>
</body></html>`;
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

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

export async function payRoutes(app: FastifyInstance): Promise<void> {
  // Classic YiPay-compatible
  app.all("/submit.php", async (req, reply) => {
    const result = await handleCreate(req, "submit");
    if (result && typeof result === "object" && "__html" in result) {
      return reply.type("text/html; charset=utf-8").send((result as { __html: string }).__html);
    }
    return reply.send(result);
  });

  app.all("/mapi.php", async (req) => handleCreate(req, "mapi"));

  app.all("/api.php", async (req) => handleQuery(req));

  // Modern REST aliases
  app.post("/api/v1/pay/submit", async (req, reply) => {
    const result = await handleCreate(req, "submit");
    if (result && typeof result === "object" && "__html" in result) {
      return reply.type("text/html; charset=utf-8").send((result as { __html: string }).__html);
    }
    return reply.send(result);
  });

  app.post("/api/v1/pay/create", async (req) => handleCreate(req, "mapi"));

  app.get("/api/v1/order/query", async (req) => handleQuery(req));
}
