import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import { env } from "../config/env.js";
import {
  channelConfigs,
  getDb,
  merchants,
  orders,
  verifyPassword,
} from "../db/index.js";
import { adminUsers } from "../db/schema.js";
import { centsToMoney } from "../pay/sign.js";

type SessionPayload = {
  sub: number;
  username: string;
  role: string;
  exp: number;
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function signToken(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", env.appSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", env.appSecret)
    .update(body)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = JSON.parse(
      Buffer.from(body.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString(
        "utf8",
      ),
    ) as SessionPayload;
    if (!json.exp || json.exp < Date.now()) return null;
    return json;
  } catch {
    return null;
  }
}

function getBearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const token = getBearer(req);
  if (!token) {
    reply.code(401).send({ code: 401, msg: "unauthorized" });
    return null;
  }
  const session = verifyToken(token);
  if (!session) {
    reply.code(401).send({ code: 401, msg: "unauthorized" });
    return null;
  }
  return session;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/admin/api/login", async (req, reply) => {
    const body = (req.body ?? {}) as { username?: string; password?: string };
    const username = body.username?.trim() || "";
    const password = body.password || "";
    if (!username || !password) {
      return reply.code(400).send({ code: 400, msg: "username/password required" });
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ code: 401, msg: "invalid credentials" });
    }

    const token = signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    });

    return {
      code: 0,
      msg: "ok",
      token,
      user: { id: user.id, username: user.username, role: user.role },
    };
  });

  app.post("/admin/api/logout", async () => ({ code: 0, msg: "ok" }));

  app.get("/admin/api/me", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    return {
      code: 0,
      user: {
        id: session.sub,
        username: session.username,
        role: session.role,
      },
    };
  });

  app.get("/admin/api/orders", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;

    const q = req.query as {
      page?: string;
      page_size?: string;
      status?: string;
    };
    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.page_size || 20)));
    const offset = (page - 1) * pageSize;

    const db = getDb();
    let rows = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.id))
      .limit(pageSize)
      .offset(offset);

    if (q.status) {
      rows = rows.filter((r) => r.status === q.status);
    }

    return {
      code: 0,
      page,
      page_size: pageSize,
      list: rows.map((o) => ({
        id: o.id,
        trade_no: o.tradeNo,
        out_trade_no: o.outTradeNo,
        merchant_id: o.merchantId,
        channel: o.channel,
        name: o.name,
        money: centsToMoney(o.amountCents),
        amount_cents: o.amountCents,
        status: o.status,
        notify_status: o.notifyStatus,
        created_at: o.createdAt,
        paid_at: o.paidAt,
      })),
    };
  });

  app.get("/admin/api/orders/:tradeNo", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    const { tradeNo } = req.params as { tradeNo: string };
    const db = getDb();
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tradeNo, tradeNo))
      .limit(1);
    const o = rows[0];
    if (!o) return reply.code(404).send({ code: 404, msg: "not found" });
    return {
      code: 0,
      order: {
        id: o.id,
        trade_no: o.tradeNo,
        out_trade_no: o.outTradeNo,
        merchant_id: o.merchantId,
        channel: o.channel,
        name: o.name,
        money: centsToMoney(o.amountCents),
        amount_cents: o.amountCents,
        status: o.status,
        notify_status: o.notifyStatus,
        notify_url: o.notifyUrl,
        return_url: o.returnUrl,
        param: o.param,
        pay_url: o.payUrl,
        qr_code: o.qrCode,
        channel_trade_no: o.channelTradeNo,
        created_at: o.createdAt,
        paid_at: o.paidAt,
      },
    };
  });

  app.get("/admin/api/channels/alipay", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    const db = getDb();
    const rows = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.channel, "alipay"))
      .limit(1);
    const row = rows[0];
    let cfg: Record<string, string> = {};
    if (row) {
      try {
        cfg = JSON.parse(row.configJson) as Record<string, string>;
      } catch {
        cfg = {};
      }
    }
    return {
      code: 0,
      channel: "alipay",
      enabled: row?.enabled ?? true,
      mode: env.channelMode,
      config: {
        app_id: cfg.app_id || env.alipayAppId || "",
        // never return private key plaintext in full if long — still needed for admin edit; mask if empty only
        private_key: cfg.private_key ? maskKey(cfg.private_key) : "",
        public_key: cfg.public_key ? maskKey(cfg.public_key) : "",
        notify_url:
          cfg.notify_url ||
          env.alipayNotifyUrl ||
          `${env.appUrl}/channels/alipay/notify`,
        return_url: cfg.return_url || env.alipayReturnUrl || env.appUrl,
        settle_account_label: cfg.settle_account_label || env.alipayAccount || "",
        has_private_key: Boolean(cfg.private_key || env.alipayPrivateKey),
        has_public_key: Boolean(cfg.public_key || env.alipayPublicKey),
      },
    };
  });

  app.put("/admin/api/channels/alipay", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const db = getDb();
    const rows = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.channel, "alipay"))
      .limit(1);

    let current: Record<string, string> = {};
    if (rows[0]) {
      try {
        current = JSON.parse(rows[0].configJson) as Record<string, string>;
      } catch {
        current = {};
      }
    }

    const next = {
      app_id: String(body.app_id ?? current.app_id ?? env.alipayAppId ?? ""),
      private_key: String(
        body.private_key ?? current.private_key ?? env.alipayPrivateKey ?? "",
      ),
      public_key: String(
        body.public_key ?? current.public_key ?? env.alipayPublicKey ?? "",
      ),
      notify_url: String(
        body.notify_url ??
          current.notify_url ??
          env.alipayNotifyUrl ??
          `${env.appUrl}/channels/alipay/notify`,
      ),
      return_url: String(
        body.return_url ?? current.return_url ?? env.alipayReturnUrl ?? env.appUrl,
      ),
      settle_account_label: String(
        body.settle_account_label ??
          current.settle_account_label ??
          env.alipayAccount ??
          "",
      ),
    };

    // Ignore masked placeholders on update
    if (typeof body.private_key === "string" && body.private_key.includes("****")) {
      next.private_key = current.private_key || env.alipayPrivateKey || "";
    }
    if (typeof body.public_key === "string" && body.public_key.includes("****")) {
      next.public_key = current.public_key || env.alipayPublicKey || "";
    }

    const enabled =
      body.enabled === undefined ? (rows[0]?.enabled ?? true) : Boolean(body.enabled);
    const now = Date.now();
    const configJson = JSON.stringify(next);

    if (rows[0]) {
      await db
        .update(channelConfigs)
        .set({ configJson, enabled, updatedAt: now })
        .where(eq(channelConfigs.id, rows[0].id));
    } else {
      await db.insert(channelConfigs).values({
        merchantId: null,
        channel: "alipay",
        configJson,
        enabled,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { code: 0, msg: "ok" };
  });

  app.get("/admin/api/merchants", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    const db = getDb();
    const rows = await db.select().from(merchants).orderBy(desc(merchants.id));
    return {
      code: 0,
      list: rows.map((m) => ({
        id: m.id,
        pid: m.pid,
        name: m.name,
        status: m.status,
        api_key_masked: maskKey(m.apiKey),
        created_at: m.createdAt,
      })),
    };
  });

  app.post("/admin/api/merchants", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    const body = (req.body ?? {}) as { name?: string; pid?: string };
    const name = body.name?.trim() || "Merchant";
    const db = getDb();

    let pid = body.pid?.trim();
    if (!pid) {
      const latest = await db
        .select()
        .from(merchants)
        .orderBy(desc(merchants.id))
        .limit(1);
      const base = latest[0] ? Number(latest[0].pid) : 1000;
      pid = String(Number.isFinite(base) ? base + 1 : Date.now() % 100000);
    }

    const apiKey = randomBytes(16).toString("hex");
    const now = Date.now();
    try {
      const inserted = await db
        .insert(merchants)
        .values({
          pid,
          name,
          apiKey,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const m = inserted[0];
      return {
        code: 0,
        merchant: {
          id: m.id,
          pid: m.pid,
          name: m.name,
          // Show full key once on create only
          api_key: m.apiKey,
          api_key_masked: maskKey(m.apiKey),
          status: m.status,
        },
      };
    } catch {
      return reply.code(400).send({ code: 400, msg: "create merchant failed" });
    }
  });
}
