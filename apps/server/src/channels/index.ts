import type { PaymentChannel } from "./types.js";
import { AlipayChannel, MockAlipayChannel } from "./alipay.js";
import {
  createWechatMockNativeChannel,
  createWechatNativeChannel,
} from "./wechat.js";
import { env } from "../config/env.js";

/**
 * Resolve payment channel adapter by product type / CHANNEL_MODE.
 * - mock: no real network (alipay mock or wxpay mock native)
 * - real: Alipay RSA2 or WeChat APIv3 Native
 */
export async function getChannel(type: string): Promise<PaymentChannel> {
  const t = (type || "alipay").toLowerCase();

  if (env.channelMode === "mock") {
    if (t === "wxpay") return createWechatMockNativeChannel();
    return new MockAlipayChannel();
  }

  if (t === "wxpay" || env.channelMode === "wxpay") {
    return createWechatNativeChannel();
  }

  // Default real path remains Alipay (existing behavior).
  return new AlipayChannel({
    appId: env.alipayAppId || "",
    privateKey: env.alipayPrivateKey || "",
    publicKey: env.alipayPublicKey || "",
    notifyUrl: env.alipayNotifyUrl || `${env.appUrl}/channels/alipay/notify`,
    returnUrl: env.alipayReturnUrl || env.appUrl,
  });
}

/** @deprecated use getChannel */
export async function getAlipayChannel(): Promise<PaymentChannel> {
  return getChannel("alipay");
}

export * from "./types.js";
export * from "./alipay.js";
export * from "./wechat.js";
export * from "./wechat-api-v3.js";
