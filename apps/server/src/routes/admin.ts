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

/** True when client did not supply a real secret replacement (keep stored value). */
function shouldPreserveSecret(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return true;
  const v = value.trim();
  if (v === "") return true;
  // Masked GET echo or accidental paste of redacted form value
  if (v.includes("****")) return true;
  return false;
}

function resolveSecretField(
  bodyValue: unknown,
  currentValue: string | undefined,
  envFallback: string,
): string {
  if (shouldPreserveSecret(bodyValue)) {
    return currentValue || envFallback || "";
  }
  return String(bodyValue).trim();
}

function publicAlipayConfigView(cfg: Record<string, string>) {
  const privateKey = cfg.private_key || env.alipayPrivateKey || "";
  const publicKey = cfg.public_key || env.alipayPublicKey || "";
  return {
    app_id: cfg.app_id || env.alipayAppId || "",
    // Never echo secret material (full or masked) into editable secret fields.
    private_key: "",
    public_key: "",
    notify_url:
      cfg.notify_url ||
      env.alipayNotifyUrl ||
      `${env.appUrl}/channels/alipay/notify`,
    return_url: cfg.return_url || env.alipayReturnUrl || env.appUrl,
    settle_account_label: cfg.settle_account_label || env.alipayAccount || "",
    has_private_key: Boolean(privateKey),
    has_public_key: Boolean(publicKey),
    // Optional non-secret summary for UI badges only (not a full key).
    private_key_hint: privateKey ? maskKey(privateKey) : "",
    public_key_hint: publicKey ? maskKey(publicKey) : "",
  };
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
      config: publicAlipayConfigView(cfg),
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

    // Non-secret fields: empty string is allowed as explicit clear only for labels/urls if provided;
    // missing keys keep previous.
    const pickString = (
      key: string,
      fallback: string,
    ): string => {
      if (body[key] === undefined || body[key] === null) return fallback;
      return String(body[key]).trim();
    };

    const next = {
      app_id: pickString("app_id", current.app_id || env.alipayAppId || ""),
      private_key: resolveSecretField(
        body.private_key,
        current.private_key,
        env.alipayPrivateKey || "",
      ),
      public_key: resolveSecretField(
        body.public_key,
        current.public_key,
        env.alipayPublicKey || "",
      ),
      notify_url: pickString(
        "notify_url",
        current.notify_url ||
          env.alipayNotifyUrl ||
          `${env.appUrl}/channels/alipay/notify`,
      ),
      return_url: pickString(
        "return_url",
        current.return_url || env.alipayReturnUrl || env.appUrl,
      ),
      settle_account_label: pickString(
        "settle_account_label",
        current.settle_account_label || env.alipayAccount || "",
      ),
    };

    if (next.app_id && !/^\d{1,32}$/.test(next.app_id)) {
      return reply
        .code(400)
        .send({ code: 400, msg: "app_id must be numeric (1-32 digits)" });
    }
    for (const urlKey of ["notify_url", "return_url"] as const) {
      const u = next[urlKey];
      if (u && !/^https?:\/\//i.test(u)) {
        return reply
          .code(400)
          .send({ code: 400, msg: `${urlKey} must be http(s) URL` });
      }
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

    return {
      code: 0,
      msg: "ok",
      channel: "alipay",
      enabled,
      mode: env.channelMode,
      config: publicAlipayConfigView(next),
    };
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
