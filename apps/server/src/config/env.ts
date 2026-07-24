import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve monorepo root: apps/server/src/config -> ../../../.. */
export const REPO_ROOT = path.resolve(__dirname, "../../../../");

function loadEnvFiles(): void {
  const candidates = [
    path.join(REPO_ROOT, ".env"),
    path.join(REPO_ROOT, ".env.example"),
    path.join(process.cwd(), ".env"),
  ];

  for (const file of candidates) {
    if (existsSync(file)) {
      loadDotenv({ path: file, override: false });
    }
  }
}

loadEnvFiles();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  appName: optional("APP_NAME", "HuaJian_Pay"),
  appEnv: optional("APP_ENV", "local"),
  appUrl: optional("APP_URL", "http://localhost:8080"),
  appSecret: required("APP_SECRET", "change-me"),
  host: optional("HOST", "0.0.0.0"),
  port: Number(optional("PORT", "8080")),

  dbDriver: optional("DB_DRIVER", "sqlite"),
  dbDsn: optional("DB_DSN", "./data/huajian_pay.db"),

  adminUsername: optional("ADMIN_USERNAME", "admin"),
  adminPassword: required("ADMIN_PASSWORD", "change-me"),

  platformPid: optional("PLATFORM_PID", "1000"),
  platformKey: required("PLATFORM_KEY", "change-me-merchant-key"),

  channelMode: (optional("CHANNEL_MODE", "mock") as "mock" | "alipay"),

  alipayAppId: optional("ALIPAY_APP_ID"),
  alipayPrivateKey: optional("ALIPAY_PRIVATE_KEY"),
  alipayPublicKey: optional("ALIPAY_PUBLIC_KEY"),
  alipayNotifyUrl: optional("ALIPAY_NOTIFY_URL"),
  alipayReturnUrl: optional("ALIPAY_RETURN_URL"),
  alipayAccount: optional("ALIPAY_ACCOUNT"),
} as const;

export type Env = typeof env;
