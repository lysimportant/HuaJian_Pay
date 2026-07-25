import Fastify from "fastify";
import { env } from "./config/env.js";
import { adminRoutes } from "./routes/admin.js";
import { channelRoutes } from "./routes/channels.js";
import { wechatChannelRoutes } from "./routes/wechat-channel.js";
import { healthRoutes } from "./routes/health.js";
import { payRoutes } from "./routes/pay.js";
import { publicOrderRoutes } from "./routes/public-order.js";
import { seoRoutes } from "./routes/seo.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Exact UTF-8 body bytes for WeChat APIv3 platform signature verification. */
    rawBody?: string;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.appEnv === "production" ? "info" : "debug",
    },
  });

  // Preserve raw JSON body for WeChat notify RSA verification (no re-serialize).
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      try {
        const raw = Buffer.isBuffer(body)
          ? body.toString("utf8")
          : typeof body === "string"
            ? body
            : Buffer.from(body as ArrayBuffer).toString("utf8");
        req.rawBody = raw;
        if (!raw) {
          done(null, {});
          return;
        }
        done(null, JSON.parse(raw) as unknown);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Support classic form posts (application/x-www-form-urlencoded)
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const text = typeof body === "string" ? body : body.toString("utf8");
        const params = new URLSearchParams(text);
        const obj: Record<string, string> = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        done(null, obj);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.get("/", async (_req, reply) => {
    reply.header("X-Robots-Tag", "noindex, nofollow");
    return {
      name: env.appName,
      health: "/health",
      robots: "/robots.txt",
      classic: ["/submit.php", "/mapi.php", "/api.php"],
      public: ["/api/v1/public/orders/:tradeNo/status"],
      channels: ["/channels/alipay/notify", "/channels/wxpay/notify"],
      admin: "/admin/api/*",
    };
  });

  await app.register(seoRoutes);
  await app.register(healthRoutes);
  await app.register(payRoutes);
  await app.register(publicOrderRoutes);
  await app.register(channelRoutes);
  await app.register(wechatChannelRoutes);
  await app.register(adminRoutes);

  return app;
}
