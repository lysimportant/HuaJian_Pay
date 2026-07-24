import { createHash, createSign, createVerify, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { centsToMoney } from "../pay/sign.js";
import type {
  ChannelNotifyResult,
  ChannelPrecreateInput,
  ChannelPrecreateResult,
  PaymentChannel,
} from "./types.js";

export type AlipayConfig = {
  appId: string;
  privateKey: string;
  publicKey: string;
  notifyUrl: string;
  returnUrl: string;
  gateway?: string;
};

function normalizePem(key: string, type: "PRIVATE" | "PUBLIC"): string {
  const trimmed = key.trim();
  if (trimmed.includes("BEGIN")) return trimmed.replace(/\\n/g, "\n");
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  if (type === "PRIVATE") {
    return `-----BEGIN RSA PRIVATE KEY-----\n${lines}\n-----END RSA PRIVATE KEY-----`;
  }
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function buildAlipaySignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

export function signAlipayParams(
  params: Record<string, string>,
  privateKey: string,
): string {
  const content = buildAlipaySignContent(params);
  const signer = createSign("RSA-SHA256");
  signer.update(content, "utf8");
  signer.end();
  return signer.sign(normalizePem(privateKey, "PRIVATE"), "base64");
}

export function verifyAlipaySign(
  params: Record<string, string>,
  publicKey: string,
): boolean {
  const sign = params.sign;
  if (!sign) return false;
  const content = buildAlipaySignContent(params);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(content, "utf8");
  verifier.end();
  try {
    return verifier.verify(normalizePem(publicKey, "PUBLIC"), sign, "base64");
  } catch {
    return false;
  }
}

function moneyToCentsStrict(money: string): number {
  const s = money.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return -1;
  const [yuan, frac = ""] = s.split(".");
  return Number(yuan) * 100 + Number((frac + "00").slice(0, 2));
}

export class MockAlipayChannel implements PaymentChannel {
  readonly name = "alipay" as const;

  async precreate(input: ChannelPrecreateInput): Promise<ChannelPrecreateResult> {
    const tradeNo = input.order.tradeNo;
    const token = randomBytes(6).toString("hex");
    const payurl = `${env.appUrl}/mock/alipay/pay/${tradeNo}?t=${token}`;
    const qrcode = `${env.appUrl}/mock/alipay/qr/${tradeNo}?t=${token}`;
    return {
      payurl,
      qrcode,
      channelTradeNo: `MOCK${tradeNo}`,
      raw: { mode: "mock" },
    };
  }

  async verifyNotify(
    payload: Record<string, string>,
  ): Promise<ChannelNotifyResult> {
    // Mock accepts signed-like payload with trade_status + out_trade_no + total_amount
    const tradeStatus = payload.trade_status || "";
    const tradeNo = payload.out_trade_no || "";
    const amountCents = moneyToCentsStrict(payload.total_amount || "0");
    const ok =
      (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") &&
      !!tradeNo &&
      amountCents > 0;

    return {
      ok,
      tradeNo,
      channelTradeNo: payload.trade_no || `MOCK${tradeNo}`,
      amountCents,
      tradeStatus,
      raw: payload,
      responseBody: ok ? "success" : "failure",
    };
  }
}

export class AlipayChannel implements PaymentChannel {
  readonly name = "alipay" as const;
  private readonly cfg: AlipayConfig;
  private readonly gateway: string;

  constructor(cfg: AlipayConfig) {
    this.cfg = cfg;
    this.gateway =
      cfg.gateway ||
      process.env.ALIPAY_GATEWAY ||
      "https://openapi.alipay.com/gateway.do";
  }

  async precreate(input: ChannelPrecreateInput): Promise<ChannelPrecreateResult> {
    if (!this.cfg.appId || !this.cfg.privateKey) {
      throw new Error("alipay config incomplete (app_id/private_key)");
    }

    const bizContent = {
      out_trade_no: input.order.tradeNo,
      total_amount: centsToMoney(input.order.amountCents),
      subject: input.subject.slice(0, 256),
    };

    const params: Record<string, string> = {
      app_id: this.cfg.appId,
      method: "alipay.trade.precreate",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: formatAlipayTimestamp(new Date()),
      version: "1.0",
      notify_url: input.notifyUrl || this.cfg.notifyUrl,
      biz_content: JSON.stringify(bizContent),
    };
    params.sign = signAlipayParams(params, this.cfg.privateKey);

    const body = new URLSearchParams(params);
    const res = await fetch(this.gateway, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    });
    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`alipay precreate non-json: ${text.slice(0, 200)}`);
    }

    const resp =
      (json.alipay_trade_precreate_response as Record<string, string> | undefined) ??
      {};
    if (resp.code !== "10000") {
      throw new Error(
        `alipay precreate failed: ${resp.sub_msg || resp.msg || resp.code || "unknown"}`,
      );
    }

    const qr = resp.qr_code || "";
    return {
      payurl: qr,
      qrcode: qr,
      channelTradeNo: resp.out_trade_no || input.order.tradeNo,
      raw: json,
    };
  }

  async verifyNotify(
    payload: Record<string, string>,
  ): Promise<ChannelNotifyResult> {
    if (!this.cfg.publicKey) {
      return {
        ok: false,
        responseBody: "failure",
        raw: payload,
      };
    }

    const signOk = verifyAlipaySign(payload, this.cfg.publicKey);
    const tradeStatus = payload.trade_status || "";
    const tradeNo = payload.out_trade_no || "";
    const amountCents = moneyToCentsStrict(payload.total_amount || "0");
    const statusOk =
      tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED";
    const ok = signOk && statusOk && !!tradeNo && amountCents > 0;

    return {
      ok,
      tradeNo,
      channelTradeNo: payload.trade_no,
      amountCents,
      tradeStatus,
      raw: payload,
      responseBody: ok ? "success" : "failure",
    };
  }
}

function formatAlipayTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Lightweight helper for mock paid hash (not used in sign). */
export function mockNotifyToken(tradeNo: string): string {
  return createHash("sha256").update(`mock:${tradeNo}`).digest("hex").slice(0, 12);
}
