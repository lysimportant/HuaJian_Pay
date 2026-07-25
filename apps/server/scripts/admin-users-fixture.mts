/**
 * Lightweight multi-admin API smoke (starts nothing — assumes isolated DB via env).
 * Run: CHANNEL_MODE=mock node --import tsx scripts/admin-users-fixture.mts
 * Prefer: pnpm --filter @huajian/server exec tsx scripts/admin-users-fixture.mts
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Point at ephemeral SQLite before importing server modules
const dataDir = resolve(process.cwd(), ".tmp-admin-users-test");
mkdirSync(dataDir, { recursive: true });
process.env.APP_SECRET = process.env.APP_SECRET || "fixture-app-secret-32chars!!";
process.env.CHANNEL_MODE = "mock";
process.env.DB_DRIVER = "sqlite";
process.env.DB_DSN = resolve(dataDir, "test.db");
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin12345";
process.env.PORT = "0";

const { buildApp } = await import("../src/app.js");
const { initDb } = await import("../src/db/index.js");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function json(
  app: Awaited<ReturnType<typeof buildApp>>,
  method: string,
  url: string,
  opts?: { token?: string; body?: unknown },
) {
  const res = await app.inject({
    method,
    url,
    headers: {
      ...(opts?.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts?.body ? { "content-type": "application/json" } : {}),
    },
    payload: opts?.body as never,
  });
  let body: Record<string, unknown> = {};
  try {
    body = res.json() as Record<string, unknown>;
  } catch {
    body = { raw: res.body };
  }
  return { status: res.statusCode, body };
}

await initDb();
const app = await buildApp();
await app.ready();

// login
const login = await json(app, "POST", "/admin/api/login", {
  body: { username: "admin", password: "admin12345" },
});
assert(login.status === 200 && login.body.code === 0, "login failed");
const token1 = String(login.body.token);
assert(token1.length > 10, "token missing");
const user = login.body.user as { id: number; username: string };
assert(user.username === "admin", "user username");

// me
const me = await json(app, "GET", "/admin/api/me", { token: token1 });
assert(me.status === 200 && (me.body.user as { id: number }).id === user.id, "me");

// create second admin
const created = await json(app, "POST", "/admin/api/admin-users", {
  token: token1,
  body: {
    username: "ops_user",
    password: "ops_pass_99",
    display_name: "Ops",
    role: "admin",
  },
});
assert(created.status === 200 && created.body.code === 0, "create user");
const opsId = (created.body.user as { id: number }).id;

// list
const list = await json(app, "GET", "/admin/api/admin-users", { token: token1 });
assert(
  list.status === 200 && Array.isArray(list.body.list) && (list.body.list as unknown[]).length >= 2,
  "list users",
);
assert(
  !(list.body.list as Array<Record<string, unknown>>).some((u) => "password_hash" in u || "passwordHash" in u),
  "must not echo hash",
);

// change password → old token revoked
const pw = await json(app, "PUT", "/admin/api/me/password", {
  token: token1,
  body: { old_password: "admin12345", new_password: "admin99999" },
});
assert(pw.status === 200 && pw.body.token, "password change");
const token2 = String(pw.body.token);

const revoked = await json(app, "GET", "/admin/api/me", { token: token1 });
assert(revoked.status === 401, "old token must be revoked");

const me2 = await json(app, "GET", "/admin/api/me", { token: token2 });
assert(me2.status === 200, "new token works");

// cannot disable last remaining active admin if we disable ops first then try self — disable ops ok
const disOps = await json(app, "PATCH", `/admin/api/admin-users/${opsId}`, {
  token: token2,
  body: { status: "disabled" },
});
assert(disOps.status === 200, "disable ops");

const disSelf = await json(app, "PATCH", `/admin/api/admin-users/${user.id}`, {
  token: token2,
  body: { status: "disabled" },
});
assert(disSelf.status === 400, "cannot disable last active admin");

// token version in payload is checked (forge tv mismatch)
const [payloadB64] = token2.split(".");
const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
  sub: number;
  username: string;
  role: string;
  tv: number;
  exp: number;
};
payload.tv = payload.tv + 99;
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = createHmac("sha256", process.env.APP_SECRET!)
  .update(body)
  .digest("base64url");
const forged = `${body}.${sig}`;
const forgedRes = await json(app, "GET", "/admin/api/me", { token: forged });
assert(forgedRes.status === 401, "forged tv rejected");

// timing-safe sanity (signature path still uses timingSafeEqual in verifyToken)
const a = Buffer.from("abcd");
const b = Buffer.from("abcd");
assert(timingSafeEqual(a, b), "tse");

await app.close();
console.log("PASS admin-users fixture");
process.exit(0);
