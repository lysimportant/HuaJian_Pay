import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import type { Db } from "./client.js";
import { adminUsers, channelConfigs, merchants } from "./schema.js";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${s}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function buildDefaultAlipayConfig(): string {
  return JSON.stringify({
    app_id: env.alipayAppId || "",
    private_key: env.alipayPrivateKey || "",
    public_key: env.alipayPublicKey || "",
    notify_url: env.alipayNotifyUrl || `${env.appUrl}/channels/alipay/notify`,
    return_url: env.alipayReturnUrl || env.appUrl,
    settle_account_label: env.alipayAccount || "",
  });
}

export async function seed(db: Db): Promise<void> {
  const now = Date.now();

  const existingAdmin = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, env.adminUsername))
    .limit(1);

  if (existingAdmin.length === 0) {
    await db.insert(adminUsers).values({
      username: env.adminUsername,
      passwordHash: hashPassword(env.adminPassword),
      role: "admin",
      createdAt: now,
      updatedAt: now,
    });
  }

  const existingMerchant = await db
    .select()
    .from(merchants)
    .where(eq(merchants.pid, env.platformPid))
    .limit(1);

  if (existingMerchant.length === 0) {
    await db.insert(merchants).values({
      pid: env.platformPid,
      name: "Platform Merchant",
      apiKey: env.platformKey,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  const existingChannel = await db
    .select()
    .from(channelConfigs)
    .where(eq(channelConfigs.channel, "alipay"))
    .limit(1);

  if (existingChannel.length === 0) {
    await db.insert(channelConfigs).values({
      merchantId: null,
      channel: "alipay",
      configJson: buildDefaultAlipayConfig(),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Touch seed fingerprint so logs can confirm seed ran without printing secrets.
  createHash("sha256")
    .update(`${env.adminUsername}:${env.platformPid}`)
    .digest("hex")
    .slice(0, 8);
}
