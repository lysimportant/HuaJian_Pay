/**
 * Generate fixed WeChat APIv3 E2E fixtures (RSA keys + APIv3 key + meta).
 * Run: node scripts/fixtures/wechat-apiv3/generate.mjs
 * Only regenerate if fixtures are missing/broken. Never use in production.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(dir, { recursive: true });

function rsaPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

const merchant = rsaPair();
const platform = rsaPair();
// WeChat APIv3 key is 32-byte ASCII string in practice; use 32 hex chars for fixture.
const apiv3Key = randomBytes(16).toString("hex");

writeFileSync(path.join(dir, "merchant_private_key.pem"), merchant.privateKey);
writeFileSync(path.join(dir, "merchant_public_key.pem"), merchant.publicKey);
writeFileSync(path.join(dir, "platform_private_key.pem"), platform.privateKey);
writeFileSync(path.join(dir, "platform_public_key.pem"), platform.publicKey);
writeFileSync(path.join(dir, "apiv3_key.txt"), apiv3Key + "\n");

const meta = {
  mch_id: "1900000001",
  app_id: "wx_test_appid_e2e",
  merchant_serial_no: "5157F09EFDC096DE15EBE81A47057A7232F1B8E1",
  platform_serial_no: "1DDE55AD98ED71D6EDD4A4A16996DE7B47773A8C",
  apiv3_key: apiv3Key,
  currency: "CNY",
  notify_path: "/notify/wxpay",
  note: "E2E-only fixtures. Regenerate only if broken. Never production.",
};

writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log("[fixture] wechat-apiv3 generated in", dir);
console.log("[fixture] apiv3_key length", apiv3Key.length);
