import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { channelConfigs, getDb } from "../db/index.js";
import {
  AlipayChannel,
  MockAlipayChannel,
  type AlipayConfig,
} from "./alipay.js";
import type { PaymentChannel } from "./types.js";

async function loadAlipayConfigFromDb(): Promise<Partial<AlipayConfig>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(channelConfigs)
    .where(eq(channelConfigs.channel, "alipay"))
    .limit(1);

  if (rows.length === 0) return {};
  try {
    const raw = JSON.parse(rows[0].configJson) as Record<string, string>;
    return {
      appId: raw.app_id || "",
      privateKey: raw.private_key || "",
      publicKey: raw.public_key || "",
      notifyUrl: raw.notify_url || "",
      returnUrl: raw.return_url || "",
    };
  } catch {
    return {};
  }
}

export async function getAlipayChannel(): Promise<PaymentChannel> {
  if (env.channelMode === "mock") {
    return new MockAlipayChannel();
  }

  const fromDb = await loadAlipayConfigFromDb();
  const cfg: AlipayConfig = {
    appId: fromDb.appId || env.alipayAppId || "",
    privateKey: fromDb.privateKey || env.alipayPrivateKey || "",
    publicKey: fromDb.publicKey || env.alipayPublicKey || "",
    notifyUrl:
      fromDb.notifyUrl ||
      env.alipayNotifyUrl ||
      `${env.appUrl}/channels/alipay/notify`,
    returnUrl: fromDb.returnUrl || env.alipayReturnUrl || env.appUrl,
  };

  return new AlipayChannel(cfg);
}
