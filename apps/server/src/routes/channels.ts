import type { FastifyInstance, FastifyRequest } from "fastify";
import { getAlipayChannel } from "../channels/index.js";
import { markOrderPaid } from "../pay/paid.js";
import { env } from "../config/env.js";

function collectForm(req: FastifyRequest): Record<string, string> {
  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {};
  const query =
    req.query && typeof req.query === "object"
      ? (req.query as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...query, ...body })) {
    if (v === undefined || v === null || typeof v === "object") continue;
    out[k] = String(v);
  }
  return out;
}

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.all("/channels/alipay/notify", async (req, reply) => {
    const payload = collectForm(req);
    const channel = await getAlipayChannel();
    const verified = await channel.verifyNotify(payload);

    if (!verified.ok || !verified.tradeNo || !verified.amountCents) {
      return reply.type("text/plain").send(verified.responseBody || "failure");
    }

    try {
      const result = await markOrderPaid({
        tradeNo: verified.tradeNo,
        channelTradeNo: verified.channelTradeNo,
        amountCents: verified.amountCents,
      });

      if (!result) {
        return reply.type("text/plain").send("failure");
      }

      // alreadyPaid is still success (idempotent)
      return reply.type("text/plain").send("success");
    } catch (err) {
      req.log.error({ err }, "alipay notify handle failed");
      return reply.type("text/plain").send("failure");
    }
  });

  // Mock helper: simulate paid notify in CHANNEL_MODE=mock
  app.post("/mock/alipay/pay/:tradeNo", async (req, reply) => {
    if (env.channelMode !== "mock") {
      return reply.code(404).send({ code: -1, msg: "mock disabled" });
    }

    const { tradeNo } = req.params as { tradeNo: string };
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};

    // Prefer amount from body; otherwise channel will re-check against DB via markOrderPaid after lookup
    const { queryOrderByTradeNo } = await import("../pay/orders.js");
    const order = await queryOrderByTradeNo(tradeNo);
    if (!order) {
      return reply.code(404).send({ code: -1, msg: "order not found" });
    }

    const channel = await getAlipayChannel();
    const { centsToMoney } = await import("../pay/sign.js");
    const payload = {
      out_trade_no: tradeNo,
      trade_no: `MOCK${tradeNo}`,
      trade_status: "TRADE_SUCCESS",
      total_amount: centsToMoney(order.amountCents),
      app_id: "mock",
      ...(body as Record<string, string>),
    };

    const verified = await channel.verifyNotify(payload);
    if (!verified.ok || !verified.amountCents) {
      return reply.code(400).send({ code: -1, msg: "mock verify failed" });
    }

    const result = await markOrderPaid({
      tradeNo,
      channelTradeNo: verified.channelTradeNo,
      amountCents: verified.amountCents,
    });

    return {
      code: 1,
      msg: "success",
      already_paid: result?.alreadyPaid ?? false,
      trade_no: tradeNo,
      status: "paid",
    };
  });
}
