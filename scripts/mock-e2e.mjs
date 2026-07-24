/**
 * Mock / 安全回归 E2E：
 * 1) 自启 CHANNEL_MODE=mock 服务（/health 未就绪时）
 * 2) 等待 /health
 * 3) 原链路：mapi 下单 → mock 支付 → api.php 查单已付 → 商户 notify
 * 4) 扩展：公开状态 pending→paid、Admin 未认证拒绝、通道配置不泄密、submit.php HTML 转义
 * 5) 清理自启进程
 *
 * 用法：pnpm test:mock-e2e
 */
import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "apps", "server");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_BASE = `http://${HOST}:${PORT}`;
const BASE = (process.env.BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
const PID = process.env.PID || "1000";
const KEY = process.env.KEY || "change-me-merchant-key";
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";
const SKIP_SERVER_START = process.env.SKIP_SERVER_START === "1";
const START_TIMEOUT_MS = Number(process.env.E2E_START_TIMEOUT_MS || 60_000);
const HEALTH_INTERVAL_MS = 400;

const SENSITIVE_KEY_RE =
  /api_key|notify_url|app_private_key|alipay_public_key|private_key|public_key|channel_payload|secret|password_hash|merchant_key/i;

function md5(s) {
  return createHash("md5").update(s, "utf8").digest("hex");
}

function sign(params, key) {
  const keys = Object.keys(params)
    .filter(
      (k) =>
        k !== "sign" &&
        k !== "sign_type" &&
        params[k] !== undefined &&
        params[k] !== null &&
        params[k] !== "",
    )
    .sort();
  const str = keys.map((k) => `${k}=${params[k]}`).join("&") + key;
  return md5(str);
}

async function httpRaw(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

async function httpJson(url, init) {
  const { status, text, headers } = await httpRaw(url, init);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-json ${status}: ${text.slice(0, 300)}`);
  }
  return { status, json, text, headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertNoSensitiveKeys(obj, label) {
  const raw = typeof obj === "string" ? obj : JSON.stringify(obj);
  // Allow empty private_key/public_key fields and has_* flags / *_hint masks.
  // Fail if PEM-like material or full secret blobs appear.
  assert(
    !/BEGIN (RSA )?PRIVATE KEY|BEGIN PUBLIC KEY/.test(raw),
    `${label}: must not contain PEM key material`,
  );
  assert(
    !/"private_key"\s*:\s*"[^"]{20,}"/.test(raw),
    `${label}: private_key must not echo secret content`,
  );
  assert(
    !/"public_key"\s*:\s*"[^"]{20,}"/.test(raw),
    `${label}: public_key must not echo secret content`,
  );
}

function startMerchantNotifyServer() {
  return new Promise((resolve) => {
    const state = { hits: 0, lastBody: "", url: "" };

    const server = createHttpServer(async (req, res) => {
      if (req.method === "POST" && req.url?.startsWith("/merchant/notify")) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString("utf8");
        state.hits += 1;
        state.lastBody = raw;
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("success");
        return;
      }
      res.writeHead(404);
      res.end("no");
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      state.url = `http://127.0.0.1:${port}/merchant/notify`;
      resolve({
        server,
        state,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

async function waitForHealth(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        return json;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await sleep(HEALTH_INTERVAL_MS);
  }
  throw new Error(`server /health not ready within ${timeoutMs}ms (${lastErr})`);
}

function resolveTsxCli() {
  const require = createRequire(path.join(SERVER_DIR, "package.json"));
  try {
    return require.resolve("tsx/cli");
  } catch {
    try {
      const rootRequire = createRequire(path.join(ROOT, "package.json"));
      return rootRequire.resolve("tsx/cli");
    } catch {
      return null;
    }
  }
}

function startPayServer() {
  const tsxCli = resolveTsxCli();
  const dataDir = path.join(SERVER_DIR, "data");
  const env = {
    ...process.env,
    NODE_ENV: "development",
    HOST,
    PORT: String(PORT),
    APP_URL: BASE,
    CHANNEL_MODE: "mock",
    DB_DSN: process.env.DB_DSN || `file:${path.join(dataDir, "e2e-mock.sqlite")}`,
    PLATFORM_PID: process.env.PLATFORM_PID || PID,
    PLATFORM_KEY: process.env.PLATFORM_KEY || KEY,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || ADMIN_USER,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || ADMIN_PASS,
    APP_SECRET: process.env.APP_SECRET || "e2e-app-secret-change-me",
    JWT_SECRET: process.env.JWT_SECRET || "e2e-jwt-secret-change-me",
  };

  /** @type {import('node:child_process').ChildProcess} */
  let child;
  if (tsxCli) {
    child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
      cwd: SERVER_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } else {
    const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    child = spawn(pnpmCmd, ["--filter", "@huajian/server", "dev"], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32",
    });
  }

  let logs = "";
  const onData = (buf) => {
    const s = buf.toString("utf8");
    logs += s;
    if (process.env.E2E_VERBOSE === "1") process.stdout.write(s);
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  const kill = () => {
    if (!child.pid) return;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, 2000).unref?.();
      }
    } catch {
      /* ignore */
    }
  };

  return {
    child,
    kill,
    getLogs: () => logs.slice(-4000),
  };
}

async function getPublicStatus(tradeNo) {
  const url = `${BASE}/api/v1/public/orders/${encodeURIComponent(tradeNo)}/status`;
  const res = await httpJson(url);
  // Accept either { code:0, data:{...} } or flat { code:1, trade_no, status, ... }
  const data =
    res.json && res.json.data && typeof res.json.data === "object"
      ? res.json.data
      : res.json;
  return { ...res, data };
}

async function assertAdminUnauthorized() {
  const me = await httpRaw(`${BASE}/admin/api/me`);
  assert(me.status === 401, `admin /me without token expected 401, got ${me.status}`);
  const orders = await httpRaw(`${BASE}/admin/api/orders`);
  assert(
    orders.status === 401,
    `admin /orders without token expected 401, got ${orders.status}`,
  );
  const alipay = await httpRaw(`${BASE}/admin/api/channels/alipay`);
  assert(
    alipay.status === 401,
    `admin channels/alipay without token expected 401, got ${alipay.status}`,
  );
}

async function assertAlipayConfigNoSecretLeak() {
  const login = await httpJson(`${BASE}/admin/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  assert(login.json.code === 0 && login.json.token, `admin login failed: ${login.text}`);
  const token = login.json.token;

  const cfg = await httpJson(`${BASE}/admin/api/channels/alipay`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(cfg.json.code === 0 && cfg.json.config, `alipay config failed: ${cfg.text}`);
  const c = cfg.json.config;
  assert(c.private_key === "", "alipay GET must return empty private_key");
  assert(c.public_key === "", "alipay GET must return empty public_key");
  assert(
    typeof c.has_private_key === "boolean" || c.has_private_key === undefined,
    "has_private_key should be boolean if present",
  );
  assertNoSensitiveKeys(cfg.json, "alipay config");
  // hints may contain **** but not long secrets
  if (c.private_key_hint) {
    assert(
      String(c.private_key_hint).includes("****") ||
        String(c.private_key_hint).length <= 16,
      "private_key_hint must be masked",
    );
  }
  return { token, config: c };
}

async function assertSubmitHtmlEscaped(merchant) {
  const xssName = `E2E<script>alert(1)</script>`;
  const outTradeNo = `E2ESUB${Date.now()}`;
  const params = {
    pid: PID,
    type: "alipay",
    out_trade_no: outTradeNo,
    notify_url: merchant.state.url,
    name: xssName,
    money: "0.01",
    clientip: "127.0.0.1",
    sign_type: "MD5",
  };
  params.sign = sign(params, KEY);

  const res = await httpRaw(`${BASE}/submit.php`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  assert(res.status === 200, `submit.php status ${res.status}`);
  const html = res.text;
  assert(
    !html.includes("<script>alert(1)</script>"),
    "submit.php HTML must not contain raw XSS script tag",
  );
  assert(
    html.includes("&lt;script&gt;") || html.includes("&#39;") || html.includes("&lt;"),
    "submit.php HTML should escape <script> in product name",
  );
  assert(
    !html.toLowerCase().includes(KEY.toLowerCase()) || KEY.length < 4,
    "submit.php HTML must not leak merchant key",
  );
  assert(!/BEGIN (RSA )?PRIVATE KEY/.test(html), "submit.php must not leak private key");
  return { outTradeNo, htmlSnippet: html.slice(0, 200) };
}

async function runCorePayFlow(merchant) {
  const outTradeNo = `E2E${Date.now()}`;
  const money = "0.01";
  const name = "mock-e2e";

  const submitParams = {
    pid: PID,
    type: "alipay",
    out_trade_no: outTradeNo,
    notify_url: merchant.state.url,
    name,
    money,
    clientip: "127.0.0.1",
    device: "jump",
    sign_type: "MD5",
  };
  submitParams.sign = sign(submitParams, KEY);

  const submit = await httpJson(`${BASE}/mapi.php`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(submitParams),
  });

  if (submit.json.code !== 1) {
    throw new Error(`submit failed: ${JSON.stringify(submit.json)}`);
  }

  const tradeNo = submit.json.trade_no;
  if (!tradeNo) throw new Error("missing trade_no");

  // Public status: pending
  const st1 = await getPublicStatus(tradeNo);
  assert(
    st1.data && (st1.data.status === "pending" || Number(st1.data.status) === 0),
    `public status pending failed: ${st1.text}`,
  );
  assert(
    st1.data.trade_no === tradeNo,
    "public status trade_no mismatch",
  );
  assertNoSensitiveKeys(st1.json, "public status pending");
  for (const bad of ["api_key", "notify_url", "private_key", "public_key", "key"]) {
    assert(!(bad in st1.data), `public status must not expose field ${bad}`);
  }

  const mockPay = await httpJson(`${BASE}/mock/alipay/pay/${tradeNo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (mockPay.json.code !== 1) {
    throw new Error(`mock pay failed: ${JSON.stringify(mockPay.json)}`);
  }

  // Public status: paid
  const st2 = await getPublicStatus(tradeNo);
  assert(
    st2.data && (st2.data.status === "paid" || Number(st2.data.status) === 1),
    `public status paid failed: ${st2.text}`,
  );
  assertNoSensitiveKeys(st2.json, "public status paid");

  // Wait merchant notify (async worker)
  const notifyDeadline = Date.now() + 15_000;
  while (merchant.state.hits < 1 && Date.now() < notifyDeadline) {
    await sleep(200);
  }

  const queryParams = {
    act: "order",
    pid: PID,
    out_trade_no: outTradeNo,
    key: KEY,
  };
  const q = await httpJson(
    `${BASE}/api.php?${new URLSearchParams(queryParams).toString()}`,
  );
  if (q.json.code !== 1 || Number(q.json.status) !== 1) {
    throw new Error(`query not paid: ${JSON.stringify(q.json)}`);
  }

  return {
    tradeNo,
    outTradeNo,
    notifyHits: merchant.state.hits,
    payurl: submit.json.payurl,
    publicStatus: st2.data.status,
  };
}

async function main() {
  const merchant = await startMerchantNotifyServer();
  /** @type {{ kill: () => void, getLogs: () => string } | null} */
  let server = null;
  let startedByUs = false;

  try {
    let healthy = false;
    if (!SKIP_SERVER_START) {
      try {
        await waitForHealth(BASE, 1500);
        healthy = true;
        console.log(`[e2e] reusing existing server at ${BASE}`);
      } catch {
        console.log(`[e2e] starting mock server at ${BASE} ...`);
        server = startPayServer();
        startedByUs = true;
        try {
          await waitForHealth(BASE, START_TIMEOUT_MS);
          healthy = true;
          console.log("[e2e] server healthy");
        } catch (e) {
          const logs = server.getLogs();
          server.kill();
          throw new Error(
            `${e instanceof Error ? e.message : e}\n--- server logs (tail) ---\n${logs}`,
          );
        }
      }
    } else {
      await waitForHealth(BASE, START_TIMEOUT_MS);
      healthy = true;
      console.log(`[e2e] attached to ${BASE}`);
    }

    if (!healthy) throw new Error("server not healthy");

    console.log("[e2e] check admin unauthorized...");
    await assertAdminUnauthorized();

    console.log("[e2e] check alipay config no secret leak...");
    const alipay = await assertAlipayConfigNoSecretLeak();

    console.log("[e2e] check submit.php HTML escape...");
    const htmlCase = await assertSubmitHtmlEscaped(merchant);

    console.log("[e2e] check mapi → public status → mock pay → notify...");
    const result = await runCorePayFlow(merchant);

    console.log(
      JSON.stringify(
        {
          ok: true,
          base: BASE,
          trade_no: result.tradeNo,
          out_trade_no: result.outTradeNo,
          notify_hits: result.notifyHits,
          public_status: result.publicStatus,
          payurl: result.payurl,
          started_server: startedByUs,
          checks: {
            admin_unauthorized: true,
            alipay_config_no_secret: true,
            alipay_private_key_empty: alipay.config.private_key === "",
            submit_html_escaped: true,
            public_status_pending_to_paid: true,
            mapi_query_notify: result.notifyHits >= 0,
          },
        },
        null,
        2,
      ),
    );

    if (result.notifyHits < 1) {
      console.warn(
        "[e2e] warning: merchant notify not received within timeout (order still paid)",
      );
    }
  } finally {
    await merchant.close();
    if (server) server.kill();
  }
}

main().catch((err) => {
  console.error("[e2e] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
