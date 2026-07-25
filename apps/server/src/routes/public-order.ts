import type { FastifyInstance, FastifyReply } from "fastify";
import { queryOrderByTradeNo } from "../pay/orders.js";
import { centsToMoney } from "../pay/sign.js";

type PublicOrderParams = {
  tradeNo: string;
};

const TRADE_NO_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function setNoStore(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  reply.header("Expires", "0");
  // Order status JSON must not be treated as public content for crawlers.
  reply.header("X-Robots-Tag", "noindex, nofollow, noarchive");
}

function safeReturnUrl(raw: string): string {
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : "";
  } catch {
    return "";
  }
}

function publicStatus(status: string, expiredAt: number | null): string {
  if (status === "pending" && expiredAt !== null && expiredAt <= Date.now()) {
    return "expired";
  }
  return status;
}

export async function publicOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: PublicOrderParams }>(
    "/api/v1/public/orders/:tradeNo/status",
    async (req, reply) => {
      setNoStore(reply);

      const tradeNo = String(req.params.tradeNo ?? "").trim();
      if (!TRADE_NO_PATTERN.test(tradeNo)) {
        return reply.code(400).send({
          code: -1,
          msg: "invalid trade_no",
        });
      }

      const order = await queryOrderByTradeNo(tradeNo);
      if (!order) {
        return reply.code(404).send({
          code: -1,
          msg: "order not found",
        });
      }

      const amount = centsToMoney(order.amountCents);
      return {
        code: 1,
        msg: "success",
        trade_no: order.tradeNo,
        out_trade_no: order.outTradeNo,
        type: order.channel,
        name: order.name,
        amount,
        money: amount,
        status: publicStatus(order.status, order.expiredAt),
        paid_at: order.paidAt ?? null,
        expired_at: order.expiredAt ?? null,
        expire_at: order.expiredAt ?? null,
        return_url: safeReturnUrl(order.returnUrl),
        pay_url: order.payUrl ?? "",
        qr_url: order.qrCode ?? "",
      };
    },
  );
}
