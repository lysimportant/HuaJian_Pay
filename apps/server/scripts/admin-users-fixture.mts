/**
 * Fully repeatable multi-admin API fixture (no pre-running server).
 * Uses ephemeral SQLite under .tmp-admin-users-test/ (gitignored).
 *
 * Run:
 *   pnpm test:admin-users
 *   pnpm --filter @huajian/server test:admin-users
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const dataDir = resolve(process.cwd(), ".tmp-admin-users-test");
// Wipe previous run so fixture is fully repeatable
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const APP_SECRET = process.env.APP_SECRET || "fixture-app-secret-32chars!!";
process.env.APP_SECRET = APP_SECRET;
process.env.CHANNEL_MODE = "mock";
process.env.DB_DRIVER = "sqlite";
process.env.DB_DSN = resolve(dataDir, `test-${Date.now()}-${randomBytes(4).toString("hex")}.db`);
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin12345";
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";

const { buildApp } = await import("../src/app.js");
const { initDb } = await import("../src/db/index.js");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type App = Awaited<ReturnType<typeof buildApp>>;

async function json(
  app: App,
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

const checks: string[] = [];
function pass(name: string) {
  checks.push(name);
  console.log(`  ✓ ${name}`);
}

await initDb();
const app = await buildApp();
await app.ready();

try {
  // —— 1) Login seed admin ——
  const login = await json(app, "POST", "/admin/api/login", {
    body: { username: "admin", password: "admin12345" },
  });
  assert(login.status === 200 && login.body.code === 0, `login failed: ${JSON.stringify(login.body)}`);
  const token1 = String(login.body.token);
  assert(token1.length > 10, "token missing");
  const seedUser = login.body.user as { id: number; username: string; role: string };
  assert(seedUser.username === "admin", "seed username");
  pass("login seed admin");

  // —— 2) GET /me ——
  const me = await json(app, "GET", "/admin/api/me", { token: token1 });
  assert(me.status === 200 && (me.body.user as { id: number }).id === seedUser.id, "me");
  pass("GET /me");

  // —— 3) Create second admin (new user) ——
  const created = await json(app, "POST", "/admin/api/admin-users", {
    token: token1,
    body: {
      username: "ops_user",
      password: "ops_pass_99",
      display_name: "Ops",
      role: "admin",
    },
  });
  assert(
    created.status === 200 && created.body.code === 0,
    `create user: ${JSON.stringify(created.body)}`,
  );
  const opsId = (created.body.user as { id: number }).id;
  assert(opsId > 0, "ops id");
  pass("POST /admin-users create second admin");

  // Duplicate username → 409
  const dup = await json(app, "POST", "/admin/api/admin-users", {
    token: token1,
    body: { username: "ops_user", password: "ops_pass_99", role: "admin" },
  });
  assert(dup.status === 409, `dup username expected 409 got ${dup.status}`);
  pass("duplicate username rejected");

  // —— 4) List (no password hash leak) ——
  const list = await json(app, "GET", "/admin/api/admin-users", { token: token1 });
  assert(
    list.status === 200 &&
      Array.isArray(list.body.list) &&
      (list.body.list as unknown[]).length >= 2,
    "list users",
  );
  assert(
    !(list.body.list as Array<Record<string, unknown>>).some(
      (u) => "password_hash" in u || "passwordHash" in u,
    ),
    "must not echo hash",
  );
  pass("GET /admin-users list + no hash leak");

  // —— 5) Password change → old token revoked, new token works ——
  const pw = await json(app, "PUT", "/admin/api/me/password", {
    token: token1,
    body: { old_password: "admin12345", new_password: "admin99999" },
  });
  assert(
    pw.status === 200 && pw.body.code === 0 && pw.body.token,
    `password change: ${JSON.stringify(pw.body)}`,
  );
  const token2 = String(pw.body.token);
  assert(token2 !== token1, "new token differs");

  const revoked = await json(app, "GET", "/admin/api/me", { token: token1 });
  assert(revoked.status === 401, `old token must be 401, got ${revoked.status}`);
  pass("old token invalidated after password change");

  const me2 = await json(app, "GET", "/admin/api/me", { token: token2 });
  assert(me2.status === 200 && me2.body.code === 0, "new token works");
  pass("new token accepted");

  // —— 6) Update display_name via PUT /me ——
  const upd = await json(app, "PUT", "/admin/api/me", {
    token: token2,
    body: { display_name: "Fixture Admin" },
  });
  assert(
    upd.status === 200 &&
      (upd.body.user as { display_name?: string }).display_name === "Fixture Admin",
    `update me: ${JSON.stringify(upd.body)}`,
  );
  pass("PUT /me display_name");

  // —— 7) Disable second admin; their future sessions fail ——
  // Login as ops first to get a live token, then disable
  const opsLogin = await json(app, "POST", "/admin/api/login", {
    body: { username: "ops_user", password: "ops_pass_99" },
  });
  assert(opsLogin.status === 200 && opsLogin.body.token, "ops login");
  const opsToken = String(opsLogin.body.token);

  const disOps = await json(app, "PATCH", `/admin/api/admin-users/${opsId}`, {
    token: token2,
    body: { status: "disabled" },
  });
  assert(disOps.status === 200 && disOps.body.code === 0, `disable ops: ${JSON.stringify(disOps.body)}`);
  pass("PATCH disable second admin");

  const opsMe = await json(app, "GET", "/admin/api/me", { token: opsToken });
  assert(opsMe.status === 401 || opsMe.status === 403, `disabled ops token must fail, got ${opsMe.status}`);
  pass("disabled user token rejected");

  const opsLogin2 = await json(app, "POST", "/admin/api/login", {
    body: { username: "ops_user", password: "ops_pass_99" },
  });
  assert(
    opsLogin2.status === 403 || opsLogin2.status === 401,
    `disabled login must fail, got ${opsLogin2.status}`,
  );
  pass("disabled user cannot login");

  // —— 8) Last active admin protection ——
  const disSelf = await json(app, "PATCH", `/admin/api/admin-users/${seedUser.id}`, {
    token: token2,
    body: { status: "disabled" },
  });
  assert(
    disSelf.status === 400,
    `cannot disable last active admin, got ${disSelf.status}: ${JSON.stringify(disSelf.body)}`,
  );
  pass("cannot disable last active admin");

  const demoteSelf = await json(app, "PATCH", `/admin/api/admin-users/${seedUser.id}`, {
    token: token2,
    body: { role: "viewer" },
  });
  assert(
    demoteSelf.status === 400,
    `cannot demote last active admin, got ${demoteSelf.status}`,
  );
  pass("cannot demote last active admin");

  // —— 9) Forged token_version rejected ——
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
  const sig = createHmac("sha256", APP_SECRET).update(body).digest("base64url");
  const forged = `${body}.${sig}`;
  const forgedRes = await json(app, "GET", "/admin/api/me", { token: forged });
  assert(forgedRes.status === 401, `forged tv rejected, got ${forgedRes.status}`);
  pass("forged token_version rejected");

  // timing-safe sanity
  assert(timingSafeEqual(Buffer.from("abcd"), Buffer.from("abcd")), "tse");
  pass("timingSafeEqual sanity");

  // —— 10) Unauthorized without token ——
  const noTok = await json(app, "GET", "/admin/api/admin-users");
  assert(noTok.status === 401, `no token expected 401, got ${noTok.status}`);
  pass("admin-users requires auth");

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: checks.length,
        names: checks,
        db: process.env.DB_DSN,
      },
      null,
      2,
    ),
  );
  console.log("PASS admin-users fixture");
} catch (err) {
  console.error("FAIL admin-users fixture:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await app.close();
}

process.exit(process.exitCode ?? 0);
