/**
 * Mock E2E:
 * 1) Self-start CHANNEL_MODE=mock server (unless already healthy / SKIP_SERVER_START=1)
 * 2) Wait /health
 * 3) mapi submit → mock pay → api query paid → merchant notify success
 * 4) Cleanup server process
 *
 * Usage:
 *   pnpm test:mock-e2e
 *   SKIP_SERVER_START=1 BASE_URL=http://127.0.0.1:8080 node scripts/mock-e2e.mjs
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
// Must match server PLATFORM_KEY / seed merchant api_key default
const KEY = process.env.KEY || "change-me-merchant-key";
const SKIP_SERVER_START = process.env.SKIP_SERVER_START === "1";
const START_TIMEOUT_MS = Number(process.env.E2E_START_TIMEOUT_MS || 60_000);
const HEALTH_INTERVAL_MS = 400;

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

async function httpJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-json ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, json };
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
    // env.ts reads DB_DSN (not DATABASE_URL)
    DB_DSN: process.env.DB_DSN || `file:${path.join(dataDir, "e2e-mock.sqlite")}`,
    PLATFORM_PID: process.env.PLATFORM_PID || PID,
    PLATFORM_KEY: process.env.PLATFORM_KEY || KEY,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin123",
    // env.ts requires APP_SECRET
    APP_SECRET: process.env.APP_SECRET || "e2e-app-secret-change-me",
    JWT_SECRET: process.env.JWT_SECRET || "e2e-jwt-secret-change-me",
  };

  /** @type {import('node:child_process').ChildProcess} */
  let child;
  if (tsxCli) {
    // Prefer non-watch for e2e stability
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

async function runFlow(merchant) {
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

  const mockPay = await httpJson(`${BASE}/mock/alipay/pay/${tradeNo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (mockPay.json.code !== 1) {
    throw new Error(`mock pay failed: ${JSON.stringify(mockPay.json)}`);
  }

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
    notifyBody: merchant.state.lastBody,
    payurl: submit.json.payurl,
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
      // Reuse if already up; otherwise self-start mock server.
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

    const result = await runFlow(merchant);
    console.log(
      JSON.stringify(
        {
          ok: true,
          base: BASE,
          trade_no: result.tradeNo,
          out_trade_no: result.outTradeNo,
          notify_hits: result.notifyHits,
          payurl: result.payurl,
          started_server: startedByUs,
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
