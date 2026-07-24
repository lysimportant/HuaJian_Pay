import { eq } from "drizzle-orm";
import type {
  ChannelNotifyResult,
  ChannelPrecreateInput,
  ChannelPrecreateResult,
  PaymentChannel,
} from "./types.js";
import {
  nativePrecreate,
  type WechatApiV3Config,
} from "./wechat-api-v3.js";
import { env } from "../config/env.js";
import { channelConfigs, getDb } from "../db/index.js";

export type WechatStoredConfig = {
  mch_id?: string;
  app_id?: string;
  api_v3_key?: string;
  private_key?: string;
  serial_no?: string;
  platform_public_key?: string;
  notify_url?: string;
};

export async function loadWechatConfigFromDb(): Promise<{
  enabled: boolean;
  cfg: WechatStoredConfig;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(channelConfigs)
    .where(eq(channelConfigs.channel, "wxpay"))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { enabled: true, cfg: {} };
  }
  let cfg: WechatStoredConfig = {};
  try {
    cfg = JSON.parse(row.configJson) as WechatStoredConfig;
  } catch {
    cfg = {};
  }
  return { enabled: row.enabled, cfg };
}

export async function resolveWechatApiV3Config(): Promise<WechatApiV3Config> {
  const { enabled, cfg } = await loadWechatConfigFromDb();
  if (!enabled) {
    throw new Error("wxpay channel disabled");
  }
  const mchId = (cfg.mch_id || env.wechatMchId || "").trim();
  const appId = (cfg.app_id || env.wechatAppId || "").trim();
  const apiV3Key = (cfg.api_v3_key || env.wechatApiV3Key || "").trim();
  const merchantPrivateKeyPem = (
    cfg.private_key ||
    env.wechatPrivateKey ||
    ""
  ).trim();
  const merchantSerialNo = (
    cfg.serial_no ||
    env.wechatSerialNo ||
    ""
  ).trim();
  const platformPublicKeyPem = (
    cfg.platform_public_key ||
    env.wechatPlatformPublicKey ||
    ""
  ).trim();
  const notifyUrl =
    (cfg.notify_url || env.wechatNotifyUrl || "").trim() ||
    `${env.appUrl}/channels/wxpay/notify`;

  return {
    mchId,
    appId,
    apiV3Key,
    merchantPrivateKeyPem,
    merchantSerialNo,
    platformPublicKeyPem,
    notifyUrl,
  };
}

export class WechatNativeChannel implements PaymentChannel {
  readonly name = "wxpay" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async precreate(
    input: ChannelPrecreateInput,
  ): Promise<ChannelPrecreateResult> {
    const cfg = await resolveWechatApiV3Config();
    const result = await nativePrecreate(
      cfg,
      {
        order: input.order,
        description: input.subject,
        notifyUrl: input.notifyUrl || cfg.notifyUrl,
      },
      this.fetchImpl,
    );
    return {
      payurl: result.codeUrl,
      qrcode: result.codeUrl,
      channelTradeNo: undefined,
      raw: result.raw,
    };
  }

  async verifyNotify(
    _payload: Record<string, string>,
  ): Promise<ChannelNotifyResult> {
    // APIv3 uses JSON + headers; handled in routes/wechat-channel.ts
    return {
      ok: false,
      tradeNo: "",
      amountCents: 0,
      tradeStatus: "UNSUPPORTED",
      raw: _payload,
      responseBody: "failure",
    };
  }
}

/** Mock-friendly Native channel: deterministic code_url without calling WeChat. */
export class WechatMockNativeChannel implements PaymentChannel {
  readonly name = "wxpay" as const;

  async precreate(
    input: ChannelPrecreateInput,
  ): Promise<ChannelPrecreateResult> {
    const codeUrl = `weixin://wxpay/bizpayurl?pr=MOCK_${input.order.tradeNo}`;
    return {
      payurl: codeUrl,
      qrcode: codeUrl,
      channelTradeNo: `WXMOCK_${input.order.tradeNo}`,
      raw: { mode: "mock", channel: "wxpay" },
    };
  }

  async verifyNotify(
    payload: Record<string, string>,
  ): Promise<ChannelNotifyResult> {
    const tradeNo = payload.out_trade_no || payload.trade_no || "";
    const amountCents = Number(payload.amount_cents || payload.total || 0);
    const ok = Boolean(tradeNo) && amountCents > 0;
    return {
      ok,
      tradeNo,
      channelTradeNo: payload.transaction_id || `WXMOCK_${tradeNo}`,
      amountCents,
      tradeStatus: ok ? "SUCCESS" : "FAIL",
      raw: payload,
      responseBody: ok ? "success" : "failure",
    };
  }
}

export function createWechatNativeChannel(
  fetchImpl: typeof fetch = fetch,
): PaymentChannel {
  return new WechatNativeChannel(fetchImpl);
}

export function createWechatMockNativeChannel(): PaymentChannel {
  return new WechatMockNativeChannel();
}
