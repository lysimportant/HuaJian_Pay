/**
 * Public payer-facing pay page (HTML).
 * Spec: docs/ux/pay-page-polish.md
 * No secrets; all dynamic strings must be escaped before injection.
 */

export type PayPageChannel = "alipay" | "wxpay" | string;

export type PayPageBootstrap = {
  tradeNo: string;
  outTradeNo?: string;
  name: string;
  amount: string;
  type: PayPageChannel;
  status?: string;
  payUrl?: string;
  qrUrl?: string;
  returnUrl?: string;
  expiredAt?: number | null;
  paidAt?: number | null;
  statusApiPath?: string;
  /** Seed client error copy (safe, no secrets) */
  errorMessage?: string;
  /** Skip public status poll on first load (e.g. invalid trade_no) */
  skipPoll?: boolean;
};

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHttpUrl(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return raw;
    return "";
  } catch {
    return "";
  }
}

/**
 * Render a production-grade self-contained pay page.
 * Client polls public status API; bootstrap seeds first paint.
 */
export function renderPayPage(data: PayPageBootstrap): string {
  const tradeNo = String(data.tradeNo ?? "").trim();
  const outTradeNo = String(data.outTradeNo ?? "").trim();
  const name = String(data.name ?? "").trim() || "订单支付";
  const amount = normalizeAmount(data.amount);
  const type = String(data.type ?? "alipay").toLowerCase();
  const status = String(data.status ?? "pending");
  const payUrl = safeHttpUrl(data.payUrl);
  const qrUrl = String(data.qrUrl ?? payUrl ?? "").trim();
  const returnUrl = safeHttpUrl(data.returnUrl);
  const expiredAt =
    data.expiredAt === undefined || data.expiredAt === null
      ? null
      : Number(data.expiredAt);
  const paidAt =
    data.paidAt === undefined || data.paidAt === null
      ? null
      : Number(data.paidAt);
  const statusApiPath =
    data.statusApiPath ||
    (tradeNo
      ? `/api/v1/public/orders/${encodeURIComponent(tradeNo)}/status`
      : "");

  const bootstrap = {
    tradeNo,
    outTradeNo,
    name,
    amount,
    type,
    status,
    payUrl,
    qrUrl,
    returnUrl,
    expiredAt: Number.isFinite(expiredAt as number) ? expiredAt : null,
    paidAt: Number.isFinite(paidAt as number) ? paidAt : null,
    statusApiPath,
    errorMessage: String(data.errorMessage ?? ""),
    skipPoll: Boolean(data.skipPoll),
  };

  // JSON for <script> — escape </ to avoid breaking out of script tag
  const bootstrapJson = JSON.stringify(bootstrap).replaceAll("</", "<\\/");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light" />
  <meta name="robots" content="noindex,nofollow" />
  <title>订单支付 · 花间支付</title>
  <style>
    :root {
      --bg-app: #F4F6F9;
      --bg-surface: #FFFFFF;
      --text-primary: #0F172A;
      --text-secondary: #475569;
      --text-muted: #64748B;
      --border: #E2E8F0;
      --primary: #1D4ED8;
      --primary-hover: #1E40AF;
      --success: #16A34A;
      --warning: #D97706;
      --danger: #DC2626;
      --alipay: #1677FF;
      --alipay-bg: #E6F4FF;
      --wechat: #07C160;
      --wechat-bg: #E8F8EF;
      --shadow-card: 0 8px 30px rgba(15, 23, 42, 0.06);
      --radius: 16px;
      --focus: 0 0 0 3px rgba(29, 78, 216, 0.35);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--bg-app);
      color: var(--text-primary);
      font-family: "Segoe UI", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    body {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
    }
    .topbar {
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      letter-spacing: 0.02em;
      margin-bottom: 20px;
    }
    .shell {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .card {
      width: 100%;
      max-width: 432px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-card);
      padding: 28px 24px 22px;
    }
    .channel {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      margin-bottom: 12px;
    }
    .channel.alipay { background: var(--alipay-bg); color: var(--alipay); }
    .channel.wxpay { background: var(--wechat-bg); color: var(--wechat); }
    .channel.unknown { background: #F1F5F9; color: var(--text-secondary); }
    .subject {
      font-size: 15px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0 0 16px;
      word-break: break-word;
    }
    .amount-label {
      font-size: 13px;
      color: var(--text-muted);
      margin: 0 0 6px;
    }
    .amount {
      margin: 0 0 10px;
      font-size: 36px;
      font-weight: 700;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
      line-height: 1.15;
    }
    @media (min-width: 768px) {
      .amount { font-size: 40px; }
    }
    .countdown {
      font-size: 13px;
      color: var(--text-secondary);
      margin: 0 0 18px;
      min-height: 1.2em;
      font-variant-numeric: tabular-nums;
    }
    .countdown.warn { color: var(--warning); font-weight: 600; }
    .divider {
      height: 1px;
      background: var(--border);
      margin: 4px 0 20px;
    }
    .qr-wrap {
      display: flex;
      justify-content: center;
      margin: 0 auto 16px;
    }
    .qr-box {
      position: relative;
      width: min(72vw, 220px);
      height: min(72vw, 220px);
      max-width: 220px;
      max-height: 220px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    @media (min-width: 768px) {
      .qr-box { width: 210px; height: 210px; }
    }
    .qr-box canvas, .qr-box img {
      width: 86% !important;
      height: 86% !important;
      object-fit: contain;
    }
    .qr-skeleton {
      width: 70%;
      height: 70%;
      border-radius: 8px;
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qr-skeleton { animation: none; background: #f1f5f9; }
      .fade { transition: none !important; }
    }
    .qr-overlay {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.78);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 700;
      color: var(--text-secondary);
      letter-spacing: 0.08em;
    }
    .tip {
      text-align: center;
      font-size: 13px;
      color: var(--text-secondary);
      margin: 0 0 16px;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn {
      appearance: none;
      border: none;
      border-radius: 10px;
      min-height: 44px;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 180ms ease, opacity 180ms ease, color 180ms ease, border-color 180ms ease;
      text-decoration: none;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .btn:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
    .btn-primary.alipay { background: var(--alipay); }
    .btn-primary.alipay:hover:not(:disabled) { background: #0958d9; }
    .btn-primary.wxpay { background: var(--wechat); }
    .btn-primary.wxpay:hover:not(:disabled) { background: #06ad56; }
    .btn-secondary {
      background: #fff;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover:not(:disabled) { background: #F8FAFC; }
    .meta {
      margin-top: 18px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: var(--text-muted);
      word-break: break-all;
      line-height: 1.5;
    }
    .meta .label { color: var(--text-secondary); margin-right: 6px; font-family: inherit; }
    .footer {
      margin-top: 20px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .status-block {
      text-align: center;
      padding: 12px 0 8px;
    }
    .status-block .icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 14px;
    }
    .status-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 8px;
      color: var(--text-primary);
    }
    .status-body {
      font-size: 14px;
      color: var(--text-secondary);
      margin: 0 0 18px;
      line-height: 1.6;
    }
    .hidden { display: none !important; }
    .fade { transition: opacity 180ms ease; }
  </style>
</head>
<body>
  <div class="topbar">花间支付</div>
  <main class="shell">
    <section class="card" id="card" aria-live="polite">
      <!-- loading -->
      <div id="view-loading">
        <div class="amount-label">支付金额</div>
        <div class="qr-skeleton" style="width:48%;height:28px;margin-bottom:18px;border-radius:6px"></div>
        <div class="divider"></div>
        <div class="qr-wrap"><div class="qr-box"><div class="qr-skeleton" aria-hidden="true"></div></div></div>
        <div class="qr-skeleton" style="width:100%;height:44px;border-radius:10px;margin-top:8px"></div>
      </div>

      <!-- pay / terminal dynamic root -->
      <div id="view-main" class="hidden fade"></div>
    </section>
  </main>
  <p class="footer">支付服务由平台提供，请确认金额后支付</p>

  <script id="pay-bootstrap" type="application/json">${bootstrapJson}</script>
  <!-- Lightweight QR (no npm dep): qrcode-generator MIT -->
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js" defer></script>
  <script>
(function () {
  "use strict";

  var bootEl = document.getElementById("pay-bootstrap");
  var boot = {};
  try { boot = JSON.parse(bootEl ? bootEl.textContent : "{}"); } catch (e) { boot = {}; }

  var state = {
    tradeNo: String(boot.tradeNo || ""),
    outTradeNo: String(boot.outTradeNo || ""),
    name: String(boot.name || "订单支付"),
    amount: String(boot.amount || "0.00"),
    type: String(boot.type || "alipay").toLowerCase(),
    status: String(boot.status || "loading"),
    payUrl: String(boot.payUrl || ""),
    qrUrl: String(boot.qrUrl || ""),
    returnUrl: String(boot.returnUrl || ""),
    expiredAt: boot.expiredAt == null ? null : Number(boot.expiredAt),
    paidAt: boot.paidAt == null ? null : Number(boot.paidAt),
    statusApiPath: String(boot.statusApiPath || ""),
    errorMessage: String(boot.errorMessage || ""),
    skipPoll: Boolean(boot.skipPoll),
    phase: "loading", // loading | pending | success | expired | failed | error
    pollTimer: null,
    countdownTimer: null,
    pollStartedAt: Date.now(),
    pollIntervalMs: 2500,
    opening: false
  };

  var main = document.getElementById("view-main");
  var loading = document.getElementById("view-loading");
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function channelMeta(type) {
    if (type === "wxpay" || type === "wechat" || type === "wx") {
      return {
        key: "wxpay",
        label: "微信支付",
        tip: "请使用微信扫一扫，完成支付",
        cta: "打开微信",
        cls: "wxpay"
      };
    }
    if (type === "alipay") {
      return {
        key: "alipay",
        label: "支付宝",
        tip: "请使用支付宝扫一扫，完成支付",
        cta: "打开支付宝",
        cls: "alipay"
      };
    }
    return {
      key: "unknown",
      label: "在线支付",
      tip: "请使用对应 App 扫一扫完成支付",
      cta: "继续支付",
      cls: "unknown"
    };
  }

  function formatAmount(a) {
    var n = Number(a);
    if (!isFinite(n)) return esc(String(a || "0.00"));
    return n.toFixed(2);
  }

  function formatRemain(ms) {
    if (ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    var mm = m < 10 ? "0" + m : String(m);
    var ss = s < 10 ? "0" + s : String(s);
    return mm + ":" + ss;
  }

  function isSafeUrl(u) {
    if (!u) return false;
    try {
      var url = new URL(u, window.location.origin);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function mapStatus(raw) {
    var s = String(raw || "").toLowerCase();
    if (s === "success" || s === "paid" || s === "1") return "success";
    if (s === "expired") return "expired";
    if (s === "failed" || s === "closed" || s === "fail") return "failed";
    if (s === "pending" || s === "paying" || s === "0") return "pending";
    return s || "pending";
  }

  function derivePhase() {
    if (!state.tradeNo) {
      state.phase = "error";
      state.errorMessage = "缺少订单号";
      return;
    }
    var st = mapStatus(state.status);
    if (st === "success") {
      state.phase = "success";
      return;
    }
    if (st === "failed") {
      state.phase = "failed";
      return;
    }
    if (st === "expired") {
      state.phase = "expired";
      return;
    }
    if (state.expiredAt != null && isFinite(state.expiredAt) && state.expiredAt <= Date.now()) {
      state.phase = "expired";
      state.status = "expired";
      return;
    }
    if (st === "pending") {
      state.phase = "pending";
      return;
    }
    state.phase = "error";
    state.errorMessage = state.errorMessage || "无法识别订单状态";
  }

  function svgSuccess() {
    return '<svg class="icon" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#DCFCE7"/><path d="M16 29.5l7.5 7.5L40 20" stroke="#16A34A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function svgWarn() {
    return '<svg class="icon" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#FEF3C7"/><path d="M28 16v16" stroke="#D97706" stroke-width="3.5" stroke-linecap="round"/><circle cx="28" cy="40" r="2.2" fill="#D97706"/></svg>';
  }
  function svgFail() {
    return '<svg class="icon" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#FEE2E2"/><path d="M20 20l16 16M36 20L20 36" stroke="#DC2626" stroke-width="3.5" stroke-linecap="round"/></svg>';
  }
  function svgError() {
    return '<svg class="icon" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#F1F5F9"/><path d="M18 28h20M28 18v20" stroke="#64748B" stroke-width="3.5" stroke-linecap="round" transform="rotate(45 28 28)"/></svg>';
  }

  function amountBlock() {
    return (
      '<p class="amount-label" id="amount-label">支付金额</p>' +
      '<p class="amount" aria-labelledby="amount-label">￥' + formatAmount(state.amount) + '</p>'
    );
  }

  function orderMeta() {
    var html = '<div class="meta"><span class="label">订单号</span>' + esc(state.tradeNo) + "</div>";
    if (state.outTradeNo) {
      html += '<div class="meta" style="margin-top:6px"><span class="label">商户单号</span>' + esc(state.outTradeNo) + "</div>";
    }
    return html;
  }

  function returnBtn(primary) {
    if (!isSafeUrl(state.returnUrl)) return "";
    var cls = primary ? "btn btn-primary" : "btn btn-secondary";
    return '<a class="' + cls + '" href="' + esc(state.returnUrl) + '" rel="noopener noreferrer">返回商户</a>';
  }

  function renderQr(expired) {
    var ch = channelMeta(state.type);
    var content = state.qrUrl || state.payUrl || "";
    var box =
      '<div class="qr-wrap"><div class="qr-box" id="qr-box" role="img" aria-label="支付二维码，金额 ' +
      formatAmount(state.amount) +
      ' 元">';
    if (!content) {
      box += '<span style="color:var(--text-muted);font-size:13px;padding:12px;text-align:center">暂无二维码</span>';
    } else {
      box += '<div id="qr-mount"></div>';
    }
    if (expired) {
      box += '<div class="qr-overlay">已过期</div>';
    }
    box += "</div></div>";
    box += '<p class="tip">' + esc(ch.tip) + "</p>";
    return box;
  }

  function paintQr() {
    var mount = document.getElementById("qr-mount");
    if (!mount) return;
    var content = state.qrUrl || state.payUrl || "";
    if (!content) return;
    if (typeof qrcode === "function") {
      try {
        var qr = qrcode(0, "M");
        qr.addData(content);
        qr.make();
        mount.innerHTML = qr.createSvgTag(4, 0);
        var svg = mount.querySelector("svg");
        if (svg) {
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          svg.style.display = "block";
        }
        return;
      } catch (e) {}
    }
    // Fallback: show text link only
    mount.innerHTML = '<span style="font-size:12px;color:var(--text-muted);padding:8px;text-align:center;word-break:break-all">请点击下方按钮完成支付</span>';
  }

  function renderPending() {
    var ch = channelMeta(state.type);
    var countdownHtml = "";
    if (state.expiredAt != null && isFinite(state.expiredAt)) {
      countdownHtml = '<p class="countdown" id="countdown"></p>';
    }
    var primary = "";
    if (isSafeUrl(state.payUrl)) {
      primary =
        '<button type="button" class="btn btn-primary ' +
        ch.cls +
        '" id="btn-open">' +
        esc(ch.cta) +
        "</button>";
    }
    return (
      '<div class="channel ' + ch.cls + '">' + esc(ch.label) + "</div>" +
      '<p class="subject">' + esc(state.name) + "</p>" +
      amountBlock() +
      countdownHtml +
      '<div class="divider"></div>' +
      renderQr(false) +
      '<div class="actions">' +
      primary +
      '<button type="button" class="btn btn-secondary" id="btn-done">我已完成支付</button>' +
      "</div>" +
      orderMeta()
    );
  }

  function renderSuccess() {
    return (
      '<div class="status-block">' +
      svgSuccess() +
      '<h1 class="status-title">支付成功</h1>' +
      '<p class="status-body">金额 ￥' + formatAmount(state.amount) + "</p>" +
      amountBlock() +
      '<div class="actions">' +
      (returnBtn(true) || '<button type="button" class="btn btn-secondary" id="btn-finish">完成</button>') +
      "</div>" +
      orderMeta() +
      "</div>"
    );
  }

  function renderExpired() {
    return (
      '<div class="status-block">' +
      svgWarn() +
      '<h1 class="status-title">订单已过期</h1>' +
      '<p class="status-body">请返回商户网站重新发起支付</p>' +
      amountBlock() +
      renderQr(true) +
      '<div class="actions">' +
      (returnBtn(false) || "") +
      "</div>" +
      orderMeta() +
      "</div>"
    );
  }

  function renderFailed() {
    var body = state.errorMessage ? esc(state.errorMessage) : "订单支付失败或已关闭";
    return (
      '<div class="status-block">' +
      svgFail() +
      '<h1 class="status-title">支付失败</h1>' +
      '<p class="status-body">' + body + "</p>" +
      amountBlock() +
      '<div class="actions">' +
      (returnBtn(true) || "") +
      "</div>" +
      orderMeta() +
      "</div>"
    );
  }

  function renderError() {
    var body = state.errorMessage || "无法加载订单信息";
    return (
      '<div class="status-block">' +
      svgError() +
      '<h1 class="status-title">无法加载订单</h1>' +
      '<p class="status-body">' + esc(body) + "</p>" +
      '<div class="actions">' +
      '<button type="button" class="btn btn-primary" id="btn-retry">重试</button>' +
      returnBtn(false) +
      "</div>" +
      (state.tradeNo ? orderMeta() : "") +
      "</div>"
    );
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function stopCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  function updateCountdown() {
    var el = document.getElementById("countdown");
    if (!el || state.expiredAt == null) return;
    var remain = state.expiredAt - Date.now();
    if (remain <= 0) {
      el.textContent = "剩余 00:00";
      el.className = "countdown warn";
      state.phase = "expired";
      state.status = "expired";
      stopPolling();
      stopCountdown();
      paint();
      return;
    }
    el.textContent = "剩余 " + formatRemain(remain);
    el.className = remain < 60000 ? "countdown warn" : "countdown";
  }

  function bindActions() {
    var openBtn = document.getElementById("btn-open");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        if (state.opening || !isSafeUrl(state.payUrl)) return;
        state.opening = true;
        openBtn.disabled = true;
        try {
          window.location.href = state.payUrl;
        } finally {
          setTimeout(function () {
            state.opening = false;
            openBtn.disabled = false;
          }, 1200);
        }
      });
    }
    var doneBtn = document.getElementById("btn-done");
    if (doneBtn) {
      doneBtn.addEventListener("click", function () {
        doneBtn.disabled = true;
        fetchStatus(true).finally(function () {
          doneBtn.disabled = false;
        });
      });
    }
    var retryBtn = document.getElementById("btn-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        state.phase = "loading";
        paint();
        fetchStatus(true);
      });
    }
    var finishBtn = document.getElementById("btn-finish");
    if (finishBtn) {
      finishBtn.addEventListener("click", function () {
        try { window.close(); } catch (e) {}
      });
    }
  }

  function paint() {
    if (state.phase === "loading") {
      loading.classList.remove("hidden");
      main.classList.add("hidden");
      return;
    }
    loading.classList.add("hidden");
    main.classList.remove("hidden");
    var html = "";
    if (state.phase === "pending") html = renderPending();
    else if (state.phase === "success") html = renderSuccess();
    else if (state.phase === "expired") html = renderExpired();
    else if (state.phase === "failed") html = renderFailed();
    else html = renderError();
    main.innerHTML = html;
    if (state.phase === "pending" || state.phase === "expired") {
      paintQr();
    }
    if (state.phase === "pending") {
      updateCountdown();
      stopCountdown();
      if (state.expiredAt != null) {
        state.countdownTimer = setInterval(updateCountdown, 500);
      }
      schedulePoll();
    } else {
      stopPolling();
      stopCountdown();
    }
    bindActions();
  }

  function schedulePoll() {
    stopPolling();
    if (state.phase !== "pending") return;
    var elapsed = Date.now() - state.pollStartedAt;
    var interval = state.pollIntervalMs;
    if (elapsed > 120000) interval = 5000;
    if (elapsed > 300000) interval = 10000;
    state.pollTimer = setTimeout(function () {
      fetchStatus(false);
    }, interval);
  }

  function applyPayload(data) {
    if (!data || typeof data !== "object") return;
    if (data.trade_no) state.tradeNo = String(data.trade_no);
    if (data.out_trade_no) state.outTradeNo = String(data.out_trade_no);
    if (data.name) state.name = String(data.name);
    if (data.amount != null) state.amount = String(data.amount);
    else if (data.money != null) state.amount = String(data.money);
    if (data.type) state.type = String(data.type).toLowerCase();
    if (data.status != null) state.status = String(data.status);
    if (data.pay_url) state.payUrl = String(data.pay_url);
    if (data.qr_url) state.qrUrl = String(data.qr_url);
    if (data.return_url != null) {
      state.returnUrl = isSafeUrl(String(data.return_url)) ? String(data.return_url) : "";
    }
    if (data.expired_at != null) state.expiredAt = Number(data.expired_at);
    else if (data.expire_at != null) state.expiredAt = Number(data.expire_at);
    if (data.paid_at != null) state.paidAt = Number(data.paid_at);
  }

  function fetchStatus(manual) {
    if (!state.tradeNo || !state.statusApiPath) {
      state.phase = "error";
      state.errorMessage = "缺少订单号";
      paint();
      return Promise.resolve();
    }
    return fetch(state.statusApiPath, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(function (res) {
        if (res.status === 404) {
          state.phase = "error";
          state.errorMessage = "订单不存在或已失效";
          paint();
          return null;
        }
        if (!res.ok) {
          throw new Error("http " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (data.code != null && Number(data.code) !== 1) {
          state.phase = "error";
          state.errorMessage = data.msg || "无法加载订单信息";
          paint();
          return;
        }
        applyPayload(data);
        var prev = state.phase;
        derivePhase();
        if (manual || prev !== state.phase || state.phase === "pending") {
          paint();
        } else {
          schedulePoll();
        }
      })
      .catch(function () {
        if (state.phase === "loading" || manual) {
          state.phase = "error";
          state.errorMessage = "网络异常，请检查后重试";
          paint();
        } else {
          schedulePoll();
        }
      });
  }

  // Initial paint from bootstrap (skip blank skeleton if we have trade data)
  if (state.tradeNo && state.amount) {
    derivePhase();
    if (state.phase === "pending" || state.phase === "success" || state.phase === "expired" || state.phase === "failed") {
      paint();
    } else {
      state.phase = "loading";
      paint();
    }
  } else {
    state.phase = "loading";
    paint();
  }

  // Always refresh from public API when available
  function start() {
    if (state.skipPoll) {
      if (state.status === "error" || !state.tradeNo) {
        state.phase = "error";
        state.errorMessage = state.errorMessage || "无法加载订单信息";
      } else {
        derivePhase();
      }
      paint();
      return;
    }
    if (!state.tradeNo) {
      state.phase = "error";
      state.errorMessage = "缺少订单号";
      paint();
      return;
    }
    fetchStatus(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // If QR lib loads later, re-paint QR
  window.addEventListener("load", function () {
    if (state.phase === "pending" || state.phase === "expired") paintQr();
  });
})();
  </script>
</body>
</html>`;
}

function normalizeAmount(raw: string | undefined): string {
  if (raw === undefined || raw === null || raw === "") return "0.00";
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    // keep original if already looks like money string
    const s = String(raw).trim();
    return s || "0.00";
  }
  return n.toFixed(2);
}
