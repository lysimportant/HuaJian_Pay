import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  assertTransactionMatchesOrder,
  parseAndDecryptNotify,
  type WechatNotifyHeaders,
} from "../channels/wechat-api-v3.js";
import { resolveWechatApiV3Config } from "../channels/wechat.js";
import { getDb, orders } from "../db/index.js";
import { markOrderPaid } from "../pay/paid.js";

type ReqWithRaw = FastifyRequest & { rawBody?: string };

/**
 * WeChat Pay APIv3 payment notify (Native).
 * Encapsulated plugin so raw JSON body is available for RSA verify without
 * changing Alipay/admin JSON parsers.
 */
export async function wechatChannelRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (req, body, done) => {
        try {
          const raw = typeof body === "string" ? body : String(body);
          (req as ReqWithRaw).rawBody = raw;
          const json = raw ? JSON.parse(raw) : {};
          done(null, json);
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    scope.post("/channels/wxpay/notify", async (req, reply) => {
      // P0: only exact request bytes; never re-serialize parsed JSON for RSA verify.
      const rawBody =
        typeof (req as ReqWithRaw).rawBody === "string"
          ? (req as ReqWithRaw).rawBody!
          : typeof req.body === "string"
            ? req.body
            : "";
      if (!rawBody) {
        req.log.error("wechat notify missing rawBody");
        return reply
          .code(500)
          .send({ code: "FAIL", message: "无法获取原始报文" });
      }

      const headers: WechatNotifyHeaders = {
        timestamp: String(req.headers["wechatpay-timestamp"] || ""),
        nonce: String(req.headers["wechatpay-nonce"] || ""),
        signature: String(req.headers["wechatpay-signature"] || ""),
        serial: String(req.headers["wechatpay-serial"] || ""),
      };

      if (
        !headers.timestamp ||
        !headers.nonce ||
        !headers.signature ||
        !headers.serial
      ) {
        return reply
          .code(401)
          .send({ code: "FAIL", message: "missing signature headers" });
      }

      let cfg;
      try {
        cfg = await resolveWechatApiV3Config();
      } catch (err) {
        req.log.error({ err }, "wechat config resolve failed");
        return reply.code(500).send({ code: "FAIL", message: "config error" });
      }

      if (!cfg.platformPublicKeyPem || !cfg.apiV3Key) {
        return reply
          .code(500)
          .send({ code: "FAIL", message: "wechat verify material missing" });
      }

      let tx;
      try {
        tx = parseAndDecryptNotify(rawBody, headers, cfg);
      } catch (err) {
        req.log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "wechat notify verify/decrypt failed",
        );
        return reply
          .code(401)
          .send({ code: "FAIL", message: "sign or decrypt failed" });
      }

      req.log.info(
        {
          out_trade_no: tx.out_trade_no,
          trade_state: tx.trade_state,
          transaction_id: tx.transaction_id,
        },
        "wechat notify accepted",
      );

      if (!tx.out_trade_no) {
        return reply
          .code(400)
          .send({ code: "FAIL", message: "missing out_trade_no" });
      }

      const db = getDb();
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.tradeNo, tx.out_trade_no))
        .limit(1);
      const order = rows[0];
      if (!order) {
        return reply.code(404).send({ code: "FAIL", message: "order not found" });
      }

      if (order.channel !== "wxpay") {
        return reply
          .code(400)
          .send({ code: "FAIL", message: "channel mismatch" });
      }

      try {
        assertTransactionMatchesOrder(tx, order, cfg);
      } catch (err) {
        req.log.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            trade_no: order.tradeNo,
          },
          "wechat notify business validation failed",
        );
        return reply
          .code(400)
          .send({ code: "FAIL", message: "validation failed" });
      }

      if (order.status === "paid") {
        return reply.send({ code: "SUCCESS", message: "成功" });
      }

      try {
        const paid = await markOrderPaid({
          tradeNo: order.tradeNo,
          channelTradeNo: tx.transaction_id,
          amountCents: order.amountCents,
        });
        if (!paid) {
          return reply.code(404).send({ code: "FAIL", message: "order not found" });
        }
      } catch (err) {
        req.log.error({ err }, "markOrderPaid failed");
        return reply.code(500).send({ code: "FAIL", message: "persist failed" });
      }

      return reply.send({ code: "SUCCESS", message: "成功" });
    });
  });
}
