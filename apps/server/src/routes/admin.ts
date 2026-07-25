import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { env } from "../config/env.js";
import {
  channelConfigs,
  getDb,
  hashPassword,
  merchants,
  notifyAttempts,
  orders,
  verifyPassword,
} from "../db/index.js";
import { adminUsers } from "../db/schema.js";
import { resendMerchantNotify } from "../pay/notify.js";
import { centsToMoney } from "../pay/sign.js";

type SessionPayload = {
  sub: number;
  username: string;
  role: string;
  /** token_version at issue time; must match DB or token is revoked */
  tv: number;
  exp: number;
};

type PublicAdminUser = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  status: string;
  created_at: number;
  updated_at: number;
};

const PASSWORD_MIN = 8;

/** Roles that can manage other accounts and privileged ops (admin|super_admin). */
function isManagerRole(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

function isPrivilegedRole(role: string): boolean {
  return isManagerRole(role);
}

function normalizeRole(
  input: unknown,
): "super_admin" | "admin" | "viewer" | null {
  if (input === "super_admin" || input === "admin" || input === "viewer") {
    return input;
  }
  return null;
}

function toPublicAdminUser(u: {
  id: number;
  username: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}): PublicAdminUser {
  return {
    id: u.id,
    username: u.username,
    display_name: u.displayName || "",
    role: u.role,
    status: u.status,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

function validatePasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `密码长度至少 ${PASSWORD_MIN} 位`;
  }
  return null;
}

function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return "用户名须为 3-32 位字母、数字或下划线";
  }
  return null;
}

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

/** Any authenticated console user (admin | viewer | super_admin). */
async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = getBearer(req);
  if (!token) {
    reply.code(401).send({ code: 401, msg: "未授权，请先登录" });
    return null;
  }
  const session = verifyToken(token);
  if (!session) {
    reply.code(401).send({ code: 401, msg: "登录已失效，请重新登录" });
    return null;
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, session.sub))
    .limit(1);
  const user = rows[0];
  if (!user || user.status !== "active") {
    reply.code(401).send({ code: 401, msg: "账号不可用或已禁用" });
    return null;
  }
  // Missing tv (legacy tokens) or mismatched version → force re-login
  if (typeof session.tv !== "number" || session.tv !== user.tokenVersion) {
    reply.code(401).send({ code: 401, msg: "凭证已失效，请重新登录" });
    return null;
  }
  // Flat shape keeps existing call sites (`session.sub`) working
  return { ...session, user };
}

/**
 * Privileged ops: channel secrets, merchants, notify resend, etc.
 * Viewers must not reach these endpoints.
 */
async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const ctx = await requireAuth(req, reply);
  if (!ctx) return null;
  if (!isManagerRole(ctx.user.role)) {
    reply.code(403).send({ code: 403, msg: "权限不足：需要管理员角色" });
    return null;
  }
  return ctx;
}

/** super_admin 或 admin 可管理账号；viewer 禁止。 */
async function requireAccountManager(req: FastifyRequest, reply: FastifyReply) {
  const ctx = await requireAdmin(req, reply);
  if (!ctx) return null;
  if (!isManagerRole(ctx.user.role)) {
    reply.code(403).send({ code: 403, msg: "权限不足，普通用户无法管理账号" });
    return null;
  }
  return ctx;
}

async function countActivePrivilegedAdmins(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(adminUsers)
    .where(
      and(
        eq(adminUsers.status, "active"),
        or(
          eq(adminUsers.role, "admin"),
          eq(adminUsers.role, "super_admin"),
        )!,
      ),
    );
  return Number(rows[0]?.c ?? 0);
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
      return reply
        .code(400)
        .send({ code: 400, msg: "请输入用户名和密码" });
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);
    const user = rows[0];
    // Stable Chinese message for wrong password / unknown user (no user enumeration detail)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ code: 401, msg: "用户名或密码错误" });
    }
    if (user.status !== "active") {
      return reply.code(403).send({ code: 403, msg: "账号已禁用" });
    }

    const token = signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      tv: user.tokenVersion ?? 0,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    });

    return {
      code: 0,
      msg: "ok",
      token,
      user: toPublicAdminUser({
        id: user.id,
        username: user.username,
        displayName: user.displayName ?? "",
        role: user.role,
        status: user.status ?? "active",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }),
    };
  });

  // —— Current admin profile (viewer may read/update self) ——
  app.get("/admin/api/me", async (req, reply) => {
    const session = await requireAuth(req, reply);
    if (!session) return;
    reply.header("Cache-Control", "private, no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    reply.header("Vary", "Authorization");
    return { code: 0, user: toPublicAdminUser(session.user) };
  });

  app.put("/admin/api/me", async (req, reply) => {
    const session = await requireAuth(req, reply);
    if (!session) return;
    const body = (req.body ?? {}) as {
      display_name?: string;
      username?: string;
    };
    const db = getDb();
    const patch: {
      displayName?: string;
      username?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (body.display_name !== undefined) {
      const dn = String(body.display_name).trim();
      if (dn.length > 64) {
        return reply.code(400).send({ code: 400, msg: "显示名过长（最多 64 字）" });
      }
      patch.displayName = dn;
    }

    const usernameChanging =
      body.username !== undefined &&
      String(body.username).trim() !== session.user.username;

    if (body.username !== undefined) {
      const un = String(body.username).trim();
      const err = validateUsername(un);
      if (err) return reply.code(400).send({ code: 400, msg: err });
      if (un !== session.user.username) {
        const clash = await db
          .select({ id: adminUsers.id })
          .from(adminUsers)
          .where(eq(adminUsers.username, un))
          .limit(1);
        if (clash.length > 0) {
          return reply.code(409).send({ code: 409, msg: "用户名已存在" });
        }
        patch.username = un;
      }
    }

    // Username is in JWT claims — bump token_version so old tokens die.
    const writePatch: Record<string, unknown> = { ...patch };
    if (usernameChanging) {
      writePatch.tokenVersion = (session.user.tokenVersion ?? 0) + 1;
    }

    const updated = await db
      .update(adminUsers)
      .set(writePatch)
      .where(eq(adminUsers.id, session.user.id))
      .returning();
    const u = updated[0];
    if (usernameChanging) {
      const token = signToken({
        sub: u.id,
        username: u.username,
        role: u.role,
        tv: u.tokenVersion ?? 0,
        exp: Date.now() + 12 * 60 * 60 * 1000,
      });
      return {
        code: 0,
        msg: "ok",
        token,
        user: toPublicAdminUser(u),
      };
    }
    return { code: 0, msg: "ok", user: toPublicAdminUser(u) };
  });

  app.put("/admin/api/me/password", async (req, reply) => {
    const session = await requireAuth(req, reply);
    if (!session) return;
    const body = (req.body ?? {}) as {
      current_password?: string;
      old_password?: string;
      new_password?: string;
    };
    const oldPassword = body.current_password || body.old_password || "";
    const newPassword = body.new_password || "";
    if (!oldPassword || !newPassword) {
      return reply
        .code(400)
        .send({ code: 400, msg: "请填写原密码和新密码" });
    }
    if (!verifyPassword(oldPassword, session.user.passwordHash)) {
      return reply.code(401).send({ code: 401, msg: "原密码错误" });
    }
    const pol = validatePasswordPolicy(newPassword);
    if (pol) return reply.code(400).send({ code: 400, msg: pol });
    if (oldPassword === newPassword) {
      return reply
        .code(400)
        .send({ code: 400, msg: "新密码不能与原密码相同" });
    }

    const db = getDb();
    const now = Date.now();
    const nextTv = (session.user.tokenVersion ?? 0) + 1;
    const updated = await db
      .update(adminUsers)
      .set({
        passwordHash: hashPassword(newPassword),
        tokenVersion: nextTv,
        updatedAt: now,
      })
      .where(eq(adminUsers.id, session.user.id))
      .returning();

    const token = signToken({
      sub: updated[0].id,
      username: updated[0].username,
      role: updated[0].role,
      tv: nextTv,
      exp: now + 12 * 60 * 60 * 1000,
    });
    return {
      code: 0,
      msg: "ok",
      token,
      user: toPublicAdminUser(updated[0]),
    };
  });

  // —— Multi-admin CRUD (super_admin/admin)；viewer 禁止 ——
  app.get("/admin/api/admin-users", async (req, reply) => {
    const session = await requireAccountManager(req, reply);
    if (!session) return;
    const q = req.query as {
      keyword?: string;
      role?: string;
      status?: string;
    };
    const db = getDb();
    const conds = [];
    const keyword = (q.keyword || "").trim();
    if (keyword) {
      const pattern = "%" + keyword.replace(/%/g, "") + "%";
      conds.push(
        or(
          like(adminUsers.username, pattern),
          like(adminUsers.displayName, pattern),
        )!,
      );
    }
    if (q.role) {
      const r = normalizeRole(q.role);
      if (!r) {
        return reply
          .code(400)
          .send({ code: 400, msg: "角色参数无效（super_admin|admin|viewer）" });
      }
      conds.push(eq(adminUsers.role, r));
    }
    if (q.status) {
      if (q.status !== "active" && q.status !== "disabled") {
        return reply
          .code(400)
          .send({ code: 400, msg: "状态参数无效（active|disabled）" });
      }
      conds.push(eq(adminUsers.status, q.status));
    }
    const rows =
      conds.length > 0
        ? await db
            .select()
            .from(adminUsers)
            .where(and(...conds))
            .orderBy(desc(adminUsers.id))
        : await db.select().from(adminUsers).orderBy(desc(adminUsers.id));
    return {
      code: 0,
      list: rows.map((u) => toPublicAdminUser(u)),
    };
  });

  app.get("/admin/api/admin-users/:id", async (req, reply) => {
    const session = await requireAccountManager(req, reply);
    if (!session) return;
    const id = Number((req.params as { id?: string }).id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ code: 400, msg: "无效的用户 ID" });
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    if (!rows[0]) {
      return reply.code(404).send({ code: 404, msg: "用户不存在" });
    }
    return { code: 0, user: toPublicAdminUser(rows[0]) };
  });

  app.post("/admin/api/admin-users", async (req, reply) => {
    const session = await requireAccountManager(req, reply);
    if (!session) return;
    const body = (req.body ?? {}) as {
      username?: string;
      password?: string;
      display_name?: string;
      role?: string;
    };
    const username = (body.username || "").trim();
    const password = body.password || "";
    const displayName = String(body.display_name ?? "").trim();
    let role: "admin" | "viewer" = "admin";
    if (body.role !== undefined) {
      if (body.role === "viewer") role = "viewer";
      else if (body.role === "admin") role = "admin";
      else if (body.role === "super_admin") {
        return reply.code(400).send({
          code: 400,
          msg: "不能通过接口创建超级管理员，请选择管理员或普通用户",
        });
      } else {
        return reply
          .code(400)
          .send({ code: 400, msg: "角色无效（admin|viewer）" });
      }
    }

    const uerr = validateUsername(username);
    if (uerr) return reply.code(400).send({ code: 400, msg: uerr });
    const perr = validatePasswordPolicy(password);
    if (perr) return reply.code(400).send({ code: 400, msg: perr });
    if (displayName.length > 64) {
      return reply.code(400).send({ code: 400, msg: "显示名过长（最多 64 字）" });
    }

    const db = getDb();
    const clash = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);
    if (clash.length > 0) {
      return reply.code(409).send({ code: 409, msg: "用户名已存在" });
    }

    const now = Date.now();
    try {
      const inserted = await db
        .insert(adminUsers)
        .values({
          username,
          passwordHash: hashPassword(password),
          displayName,
          role,
          status: "active",
          tokenVersion: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return {
        code: 0,
        msg: "ok",
        user: toPublicAdminUser(inserted[0]),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique/i.test(msg)) {
        return reply.code(409).send({ code: 409, msg: "用户名已存在" });
      }
      throw err;
    }
  });

  app.patch("/admin/api/admin-users/:id", async (req, reply) => {
    const session = await requireAccountManager(req, reply);
    if (!session) return;
    const id = Number((req.params as { id?: string }).id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ code: 400, msg: "无效的用户 ID" });
    }
    const body = (req.body ?? {}) as {
      username?: string;
      display_name?: string;
      role?: string;
      status?: string;
    };
    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    const target = rows[0];
    if (!target) {
      return reply.code(404).send({ code: 404, msg: "用户不存在" });
    }

    if (
      target.role === "super_admin" &&
      session.user.role !== "super_admin" &&
      session.user.id !== target.id
    ) {
      return reply
        .code(403)
        .send({ code: 403, msg: "仅超级管理员可修改超级管理员账号" });
    }

    const patch: {
      username?: string;
      displayName?: string;
      role?: "super_admin" | "admin" | "viewer";
      status?: "active" | "disabled";
      tokenVersion?: number;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (body.display_name !== undefined) {
      const dn = String(body.display_name).trim();
      if (dn.length > 64) {
        return reply
          .code(400)
          .send({ code: 400, msg: "显示名过长（最多 64 字）" });
      }
      patch.displayName = dn;
    }

    if (body.username !== undefined) {
      const un = String(body.username).trim();
      const uerr = validateUsername(un);
      if (uerr) return reply.code(400).send({ code: 400, msg: uerr });
      if (un !== target.username) {
        const clash = await db
          .select({ id: adminUsers.id })
          .from(adminUsers)
          .where(eq(adminUsers.username, un))
          .limit(1);
        if (clash.length > 0) {
          return reply.code(409).send({ code: 409, msg: "用户名已存在" });
        }
        patch.username = un;
      }
    }

    let nextRole = target.role as "super_admin" | "admin" | "viewer";
    if (body.role !== undefined) {
      const r = normalizeRole(body.role);
      if (!r) {
        return reply
          .code(400)
          .send({ code: 400, msg: "角色无效（super_admin|admin|viewer）" });
      }
      if (r === "super_admin" && session.user.role !== "super_admin") {
        return reply
          .code(403)
          .send({ code: 403, msg: "仅超级管理员可分配超级管理员角色" });
      }
      if (
        target.role === "super_admin" &&
        r !== "super_admin" &&
        session.user.role !== "super_admin"
      ) {
        return reply
          .code(403)
          .send({ code: 403, msg: "仅超级管理员可调整超级管理员角色" });
      }
      nextRole = r;
      patch.role = r;
    }

    let nextStatus = target.status as "active" | "disabled";
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "disabled") {
        return reply
          .code(400)
          .send({ code: 400, msg: "状态无效（active|disabled）" });
      }
      nextStatus = body.status;
      patch.status = body.status;
      if (body.status === "disabled") {
        patch.tokenVersion = (target.tokenVersion ?? 0) + 1;
      }
    }

    const wasPrivilegedActive =
      target.status === "active" && isPrivilegedRole(target.role);
    const willBePrivilegedActive =
      nextStatus === "active" && isPrivilegedRole(nextRole);

    if (wasPrivilegedActive && !willBePrivilegedActive) {
      const n = await countActivePrivilegedAdmins();
      if (n <= 1) {
        return reply.code(400).send({
          code: 400,
          msg: "不能禁用或降级最后一个有效管理员",
        });
      }
    }

    const updated = await db
      .update(adminUsers)
      .set(patch)
      .where(eq(adminUsers.id, id))
      .returning();
    return { code: 0, msg: "ok", user: toPublicAdminUser(updated[0]) };
  });

  app.delete("/admin/api/admin-users/:id", async (req, reply) => {
    const session = await requireAccountManager(req, reply);
    if (!session) return;
    const id = Number((req.params as { id?: string }).id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ code: 400, msg: "无效的用户 ID" });
    }
    if (id === session.user.id) {
      return reply.code(400).send({ code: 400, msg: "不能删除当前登录账号" });
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    const target = rows[0];
    if (!target) {
      return reply.code(404).send({ code: 404, msg: "用户不存在" });
    }
    if (
      target.role === "super_admin" &&
      session.user.role !== "super_admin"
    ) {
      return reply
        .code(403)
        .send({ code: 403, msg: "仅超级管理员可删除超级管理员账号" });
    }
    if (target.status === "active" && isPrivilegedRole(target.role)) {
      const n = await countActivePrivilegedAdmins();
      if (n <= 1) {
        return reply.code(400).send({
          code: 400,
          msg: "不能删除最后一个有效管理员",
        });
      }
    }
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
    return { code: 0, msg: "ok" };
  });

  app.post("/admin/api/admin-users/:id/reset-password", async (req, reply) => {
    const session = await requireAccountManager(req, reply);
    if (!session) return;
    const id = Number((req.params as { id?: string }).id);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ code: 400, msg: "无效的用户 ID" });
    }
    const body = (req.body ?? {}) as { new_password?: string };
    const newPassword = body.new_password || "";
    const pol = validatePasswordPolicy(newPassword);
    if (pol) return reply.code(400).send({ code: 400, msg: pol });

    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    if (!rows[0]) {
      return reply.code(404).send({ code: 404, msg: "用户不存在" });
    }
    if (
      rows[0].role === "super_admin" &&
      session.user.role !== "super_admin"
    ) {
      return reply
        .code(403)
        .send({ code: 403, msg: "仅超级管理员可重置超级管理员密码" });
    }
    const now = Date.now();
    const nextTv = (rows[0].tokenVersion ?? 0) + 1;
    const updated = await db
      .update(adminUsers)
      .set({
        passwordHash: hashPassword(newPassword),
        tokenVersion: nextTv,
        updatedAt: now,
      })
      .where(eq(adminUsers.id, id))
      .returning();
    return { code: 0, msg: "ok", user: toPublicAdminUser(updated[0]) };
  });

  app.post("/admin/api/logout", async () => ({ code: 0, msg: "ok" }));

  app.get("/admin/api/orders", async (req, reply) => {
    // Read-only order list: any authenticated console user (incl. viewer).
    const session = await requireAuth(req, reply);
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
    // Read-only order detail: any authenticated console user (incl. viewer).
    const session = await requireAuth(req, reply);
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
    const attemptCountRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(notifyAttempts)
      .where(eq(notifyAttempts.orderId, o.id));
    const attemptRows = await db
      .select()
      .from(notifyAttempts)
      .where(eq(notifyAttempts.orderId, o.id))
      .orderBy(desc(notifyAttempts.attemptNo))
      .limit(10);
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
        notify_count: Number(attemptCountRows[0]?.n ?? 0),
        notify_attempts: attemptRows.map((a) => ({
          id: a.id,
          attempt_no: a.attemptNo,
          http_status: a.httpStatus,
          response_body: a.responseBody,
          success: a.success,
          next_retry_at: a.nextRetryAt,
          created_at: a.createdAt,
        })),
      },
    };
  });

  app.post("/admin/api/orders/:tradeNo/notify/resend", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;

    const { tradeNo } = req.params as { tradeNo: string };
    const result = await resendMerchantNotify(tradeNo);
    if (!result.ok) {
      const status =
        result.reason === "order_not_found"
          ? 404
          : result.reason === "in_progress"
            ? 409
            : 400;
      return reply.code(status).send({
        code: status,
        msg: result.reason || "resend notify failed",
        order: result.order,
        attempt: result.attempt,
      });
    }

    return {
      code: 0,
      msg: result.attempt?.success ? "notify success" : "notify attempted",
      order: result.order,
      attempt: result.attempt,
    };
  });

  app.get("/admin/api/channels/alipay", async (req, reply) => {
    // Config view is redacted; still require admin (not viewer) — secrets surface area.
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

  // —— WeChat Pay APIv3 Native config (secrets never fully echoed) ——
  function publicWxpayConfigView(cfg: Record<string, string>) {
    const apiV3Key = cfg.api_v3_key || env.wechatApiV3Key || "";
    const privateKey = cfg.private_key || env.wechatPrivateKey || "";
    const platformKey =
      cfg.platform_public_key || env.wechatPlatformPublicKey || "";
    return {
      mch_id: cfg.mch_id || env.wechatMchId || "",
      app_id: cfg.app_id || env.wechatAppId || "",
      serial_no: cfg.serial_no || env.wechatSerialNo || "",
      notify_url:
        cfg.notify_url ||
        env.wechatNotifyUrl ||
        `${env.appUrl}/channels/wxpay/notify`,
      api_v3_key: "",
      private_key: "",
      platform_public_key: "",
      has_api_v3_key: Boolean(apiV3Key),
      has_private_key: Boolean(privateKey),
      has_platform_public_key: Boolean(platformKey),
      api_v3_key_hint: apiV3Key ? maskKey(apiV3Key) : "",
      private_key_hint: privateKey ? maskKey(privateKey) : "",
      platform_public_key_hint: platformKey ? maskKey(platformKey) : "",
    };
  }

  app.get("/admin/api/channels/wxpay", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    const db = getDb();
    const rows = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.channel, "wxpay"))
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
      channel: "wxpay",
      enabled: row?.enabled ?? true,
      mode: env.channelMode,
      config: publicWxpayConfigView(cfg),
    };
  });

  app.put("/admin/api/channels/wxpay", async (req, reply) => {
    const session = await requireAdmin(req, reply);
    if (!session) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const db = getDb();
    const rows = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.channel, "wxpay"))
      .limit(1);

    let current: Record<string, string> = {};
    if (rows[0]) {
      try {
        current = JSON.parse(rows[0].configJson) as Record<string, string>;
      } catch {
        current = {};
      }
    }

    const pickString = (key: string, fallback: string): string => {
      if (body[key] === undefined || body[key] === null) return fallback;
      return String(body[key]).trim();
    };

    const next = {
      mch_id: pickString("mch_id", current.mch_id || env.wechatMchId || ""),
      app_id: pickString("app_id", current.app_id || env.wechatAppId || ""),
      serial_no: pickString(
        "serial_no",
        current.serial_no || env.wechatSerialNo || "",
      ),
      notify_url: pickString(
        "notify_url",
        current.notify_url ||
          env.wechatNotifyUrl ||
          `${env.appUrl}/channels/wxpay/notify`,
      ),
      api_v3_key: resolveSecretField(
        body.api_v3_key,
        current.api_v3_key,
        env.wechatApiV3Key || "",
      ),
      private_key: resolveSecretField(
        body.private_key,
        current.private_key,
        env.wechatPrivateKey || "",
      ),
      platform_public_key: resolveSecretField(
        body.platform_public_key,
        current.platform_public_key,
        env.wechatPlatformPublicKey || "",
      ),
    };

    if (next.api_v3_key && next.api_v3_key.length !== 32) {
      return reply
        .code(400)
        .send({ code: 400, msg: "api_v3_key must be exactly 32 characters" });
    }
    if (next.notify_url && !/^https?:\/\//i.test(next.notify_url)) {
      return reply
        .code(400)
        .send({ code: 400, msg: "notify_url must be http(s) URL" });
    }

    const enabled =
      body.enabled === undefined
        ? (rows[0]?.enabled ?? true)
        : Boolean(body.enabled);
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
        channel: "wxpay",
        configJson,
        enabled,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      code: 0,
      msg: "ok",
      channel: "wxpay",
      enabled,
      mode: env.channelMode,
      config: publicWxpayConfigView(next),
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
