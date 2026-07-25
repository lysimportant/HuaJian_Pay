/**
 * Multi-admin RBAC + CRUD smoke (ephemeral SQLite).
 * Run from apps/server: pnpm exec tsx scripts/admin-users-fixture.mts
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const dataDir = resolve(process.cwd(), ".tmp-admin-users-test");
mkdirSync(dataDir, { recursive: true });
process.env.APP_SECRET = process.env.APP_SECRET || "fixture-app-secret-32chars!!";
process.env.CHANNEL_MODE = "mock";
process.env.DB_DRIVER = "sqlite";
process.env.DB_DSN = resolve(dataDir, `test-${Date.now()}.db`);
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "12345678";
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

// bad password Chinese msg
const badLogin = await json(app, "POST", "/admin/api/login", {
  body: { username: "admin", password: "wrong-pass" },
});
assert(badLogin.status === 401, "bad login status");
assert(
  String(badLogin.body.msg).includes("用户名或密码错误") ||
    String(badLogin.body.msg).includes("密码"),
  `login msg: ${badLogin.body.msg}`,
);

// login seed super_admin
const login = await json(app, "POST", "/admin/api/login", {
  body: { username: "admin", password: "12345678" },
});
assert(login.status === 200 && login.body.code === 0, "login failed");
const token1 = String(login.body.token);
const user = login.body.user as { id: number; username: string; role: string };
assert(user.username === "admin", "user username");
assert(
  user.role === "super_admin" || user.role === "admin",
  `seed role ${user.role}`,
);

// create viewer + admin
const viewer = await json(app, "POST", "/admin/api/admin-users", {
  token: token1,
  body: {
    username: "viewer1",
    password: "viewer_pass1",
    display_name: "普通用户",
    role: "viewer",
  },
});
assert(viewer.status === 200 && viewer.body.code === 0, "create viewer");
const viewerId = (viewer.body.user as { id: number }).id;

const ops = await json(app, "POST", "/admin/api/admin-users", {
  token: token1,
  body: {
    username: "ops_user",
    password: "ops_pass_99",
    display_name: "Ops",
    role: "admin",
  },
});
assert(ops.status === 200 && ops.body.code === 0, "create admin");
const opsId = (ops.body.user as { id: number }).id;

// list + filter
const list = await json(app, "GET", "/admin/api/admin-users", { token: token1 });
assert(
  list.status === 200 &&
    Array.isArray(list.body.list) &&
    (list.body.list as unknown[]).length >= 3,
  "list users",
);
assert(
  !(list.body.list as Array<Record<string, unknown>>).some(
    (u) => "password_hash" in u || "passwordHash" in u,
  ),
  "must not echo hash",
);

const filtered = await json(
  app,
  "GET",
  "/admin/api/admin-users?role=viewer&keyword=viewer",
  { token: token1 },
);
assert(filtered.status === 200, "filter list");
const fl = filtered.body.list as Array<{ username: string; role: string }>;
assert(fl.every((u) => u.role === "viewer"), "filter role viewer");

// viewer cannot list/manage
const vLogin = await json(app, "POST", "/admin/api/login", {
  body: { username: "viewer1", password: "viewer_pass1" },
});
assert(vLogin.status === 200, "viewer login");
const vToken = String(vLogin.body.token);
const vList = await json(app, "GET", "/admin/api/admin-users", { token: vToken });
assert(vList.status === 403, "viewer list forbidden");
const vMe = await json(app, "GET", "/admin/api/me", { token: vToken });
assert(vMe.status === 200, "viewer me ok");
const vCreate = await json(app, "POST", "/admin/api/admin-users", {
  token: vToken,
  body: { username: "x", password: "password1", role: "viewer" },
});
assert(vCreate.status === 403, "viewer create forbidden");

// password change revokes old token
const pw = await json(app, "PUT", "/admin/api/me/password", {
  token: token1,
  body: { current_password: "12345678", new_password: "admin99999" },
});
assert(pw.status === 200 && pw.body.token, "password change");
const token2 = String(pw.body.token);
const revoked = await json(app, "GET", "/admin/api/me", { token: token1 });
assert(revoked.status === 401, "old token must be revoked");
const me2 = await json(app, "GET", "/admin/api/me", { token: token2 });
assert(me2.status === 200, "new token works");

// delete self forbidden
const delSelf = await json(app, "DELETE", `/admin/api/admin-users/${user.id}`, {
  token: token2,
});
assert(delSelf.status === 400, "cannot delete self");
assert(String(delSelf.body.msg).includes("不能删除"), `msg ${delSelf.body.msg}`);

// delete viewer ok
const delViewer = await json(app, "DELETE", `/admin/api/admin-users/${viewerId}`, {
  token: token2,
});
assert(delViewer.status === 200, "delete viewer");

// disable ops then cannot disable last privileged
const disOps = await json(app, "PATCH", `/admin/api/admin-users/${opsId}`, {
  token: token2,
  body: { status: "disabled" },
});
assert(disOps.status === 200, "disable ops");

const disSelf = await json(app, "PATCH", `/admin/api/admin-users/${user.id}`, {
  token: token2,
  body: { status: "disabled" },
});
assert(disSelf.status === 400, "cannot disable last admin");

// forged tv
const [payloadB64] = token2.split(".");
const payload = JSON.parse(
  Buffer.from(payloadB64, "base64url").toString("utf8"),
) as {
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

const a = Buffer.from("abcd");
const b = Buffer.from("abcd");
assert(timingSafeEqual(a, b), "tse");

await app.close();
console.log("PASS admin-users fixture");
process.exit(0);
