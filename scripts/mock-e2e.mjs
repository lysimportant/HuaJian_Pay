#!/usr/bin/env node
/**
 * Deterministic mock E2E for HuaJian_Pay (no real Alipay keys).
 *
 * Prerequisites:
 *   - server running with CHANNEL_MODE=mock (default)
 *   - root .env seeded admin + platform merchant
 *
 * Usage:
 *   node scripts/mock-e2e.mjs
 *   node scripts/mock-e2e.mjs --base http://127.0.0.1:8080
 */
import { createHash } from "node:crypto";
import http from "node:http";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const BASE = arg("base", process.env.APP_URL || "http://127.0.0.1:8080").replace(
  /\/$/,
  "",
);
const PID = arg("pid", process.env.PLATFORM_PID || "1000");
const KEY = arg("key", process.env.PLATFORM_KEY || "change-me-merchant-key");
const ADMIN_USER = arg("admin-user", process.env.ADMIN_USERNAME || "admin");
const ADMIN_PASS = arg("admin-pass", process.env.ADMIN_PASSWORD || "change-me");

const results = [];
function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.error(`✗ ${name} — ${detail}`);
}

function signMd5(params, key) {
  const src = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type")
    .filter(
      (k) =>
        params[k] !== undefined &&
        params[k] !== null &&
        String(params[k]) !== "",
    )
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5").update(src + key, "utf8").digest("hex");
}

async function req(method, path, { query, body, headers } = {}) {
  const url = new URL(path, BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* plain */
  }
  return { status: res.status, text, json };
}

function startNotifyReceiver() {
  return new Promise((resolve) => {
    /** @type {{ hit: boolean, body: string, fields: Record<string,string> }} */
    const state = { hit: false, body: "", fields: {} };
    const server = http.createServer(async (req, res) => {
      if (
        req.method === "POST" &&
        (req.url === "/notify" || req.url?.startsWith("/notify"))
      ) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString("utf8");
        state.hit = true;
        state.body = raw;
        const fields = Object.fromEntries(new URLSearchParams(raw).entries());
        state.fields = fields;

        const expected = signMd5(fields, KEY);
        const signOk = Boolean(fields.sign && fields.sign === expected);
        res.statusCode = 200;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(signOk ? "success" : "failure");
        return;
      }
      res.statusCode = 404;
      res.end("no");
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        server,
        state,
        url: `http://127.0.0.1:${port}/notify`,
      });
    });
  });
}

async function main() {
  console.log(`mock-e2e base=${BASE} pid=${PID}`);

  // 1) health
  {
    const r = await req("GET", "/health");
    if (r.status === 200 && r.json?.ok) {
      ok("health", `channelMode=${r.json.channelMode || "?"}`);
      if (r.json.channelMode && r.json.channelMode !== "mock") {
        fail("channel_mode", `expected mock, got ${r.json.channelMode}`);
      }
    } else {
      fail("health", `status=${r.status} body=${r.text.slice(0, 200)}`);
    }
  }

  // 2) admin login + me
  let token = "";
  {
    const r = await req("POST", "/admin/api/login", {
      body: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    if (r.json?.code === 0 && r.json.token) {
      token = r.json.token;
      ok("admin_login", `user=${r.json.user?.username || ADMIN_USER}`);
    } else {
      fail("admin_login", r.text.slice(0, 300));
    }
  }
  if (token) {
    const r = await req("GET", "/admin/api/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (r.json?.code === 0 && r.json.user?.username) {
      ok("admin_me", r.json.user.username);
    } else {
      fail("admin_me", r.text.slice(0, 300));
    }
  }

  // 3) notify receiver + create order
  const receiver = await startNotifyReceiver();
  const outTradeNo = `E2E${Date.now()}`;
  let tradeNo = "";
  try {
    const params = {
      pid: PID,
      type: "alipay",
      out_trade_no: outTradeNo,
      notify_url: receiver.url,
      return_url: `${BASE}/`,
      name: "mock-e2e-order",
      money: "1.00",
    };
    params.sign = signMd5(params, KEY);
    params.sign_type = "MD5";

    const created = await req("POST", "/mapi.php", { body: params });
    if (created.json?.code === 1 && created.json.trade_no) {
      tradeNo = created.json.trade_no;
      ok("mapi_create", `trade_no=${tradeNo}`);
    } else {
      fail("mapi_create", created.text.slice(0, 400));
    }

    // 4) query pending
    {
      const q = await req("GET", "/api.php", {
        query: {
          act: "order",
          pid: PID,
          key: KEY,
          out_trade_no: outTradeNo,
        },
      });
      if (q.json?.code === 1 && Number(q.json.status) === 0) {
        ok("query_pending", `trade_status=${q.json.trade_status}`);
      } else {
        fail("query_pending", q.text.slice(0, 400));
      }
    }

    // 5) mock pay
    if (tradeNo) {
      const paid = await req("POST", `/mock/alipay/pay/${tradeNo}`, {
        body: {},
      });
      if (paid.json?.code === 1 || paid.json?.status === "paid") {
        ok("mock_pay", `already_paid=${paid.json.already_paid ?? false}`);
      } else {
        fail("mock_pay", paid.text.slice(0, 400));
      }
    }

    // 6) query paid
    {
      const q = await req("GET", "/api.php", {
        query: {
          act: "order",
          pid: PID,
          key: KEY,
          out_trade_no: outTradeNo,
        },
      });
      if (q.json?.code === 1 && Number(q.json.status) === 1) {
        ok("query_paid", `trade_no=${q.json.trade_no}`);
      } else {
        fail("query_paid", q.text.slice(0, 400));
      }
    }

    // 7) wait merchant notify
    const deadline = Date.now() + 8000;
    while (!receiver.state.hit && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (receiver.state.hit) {
      const f = receiver.state.fields;
      const expected = signMd5(f, KEY);
      if (
        f.trade_status === "TRADE_SUCCESS" &&
        f.sign === expected &&
        f.out_trade_no === outTradeNo
      ) {
        ok("merchant_notify", `trade_no=${f.trade_no}`);
      } else {
        fail(
          "merchant_notify",
          `bad payload trade_status=${f.trade_status} sign_ok=${f.sign === expected}`,
        );
      }
    } else {
      fail("merchant_notify", "timeout waiting for notify_url POST");
    }

    // 8) admin orders list
    if (token) {
      const list = await req("GET", "/admin/api/orders", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (list.json?.code === 0 && Array.isArray(list.json.list)) {
        const found = list.json.list.some(
          (o) => o.out_trade_no === outTradeNo || o.trade_no === tradeNo,
        );
        if (found) ok("admin_orders", "found created order");
        else fail("admin_orders", "created order not in first page");
      } else {
        fail("admin_orders", list.text.slice(0, 300));
      }
    }
  } finally {
    await new Promise((resolve) => receiver.server.close(() => resolve()));
  }

  const failed = results.filter((r) => !r.pass);
  console.log("\n--- summary ---");
  console.log(`pass=${results.length - failed.length} fail=${failed.length}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
