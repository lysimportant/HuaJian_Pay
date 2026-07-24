/**
 * WeChat APIv3 crypto helpers for E2E (mirrors apps/server wechat-api-v3).
 * Fixtures: scripts/fixtures/wechat-apiv3/
 */
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = path.join(__dirname, "fixtures", "wechat-apiv3");

export function loadWechatFixtures() {
  const meta = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, "meta.json"), "utf8"),
  );
  const merchantPrivateKeyPem = readFileSync(
    path.join(FIXTURE_DIR, "merchant_private_key.pem"),
    "utf8",
  );
  const merchantPublicKeyPem = readFileSync(
    path.join(FIXTURE_DIR, "merchant_public_key.pem"),
    "utf8",
  );
  const platformPrivateKeyPem = readFileSync(
    path.join(FIXTURE_DIR, "platform_private_key.pem"),
    "utf8",
  );
  const platformPublicKeyPem = readFileSync(
    path.join(FIXTURE_DIR, "platform_public_key.pem"),
    "utf8",
  );
  const apiV3Key = readFileSync(
    path.join(FIXTURE_DIR, "apiv3_key.txt"),
    "utf8",
  ).trim();
  return {
    meta,
    merchantPrivateKeyPem,
    merchantPublicKeyPem,
    platformPrivateKeyPem,
    platformPublicKeyPem,
    apiV3Key,
  };
}

export function buildAuthorizationMessage(
  method,
  canonicalUrl,
  timestampSec,
  nonceStr,
  body,
) {
  return `${method}\n${canonicalUrl}\n${timestampSec}\n${nonceStr}\n${body}\n`;
}

export function signMessageWithPrivateKey(message, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(key).toString("base64");
}

export function verifyMessageWithPublicKey(message, signatureB64, publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(message);
  verifier.end();
  return verifier.verify(key, Buffer.from(signatureB64, "base64"));
}

export function buildMerchantAuthorization(opts) {
  const {
    mchId,
    serialNo,
    privateKeyPem,
    method,
    canonicalUrl,
    body = "",
    timestampSec = Math.floor(Date.now() / 1000),
    nonceStr = randomUUID().replace(/-/g, ""),
  } = opts;
  const message = buildAuthorizationMessage(
    method,
    canonicalUrl,
    timestampSec,
    nonceStr,
    body,
  );
  const signature = signMessageWithPrivateKey(message, privateKeyPem);
  const token = `mchid="${mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestampSec}",serial_no="${serialNo}"`;
  return {
    authorization: `WECHATPAY2-SHA256-RSA2048 ${token}`,
    message,
    signature,
    timestampSec,
    nonceStr,
  };
}

/**
 * AES-256-GCM encrypt (WeChat APIv3).
 * - apiV3Key: 32 UTF-8 bytes
 * - nonce: 12-char UTF-8 string (server uses Buffer.from(nonce, "utf8"))
 * - ciphertext: base64(ciphertext || authTag)
 */
export function aesGcmEncrypt(apiV3Key, plaintext, associatedData = "", nonceStr) {
  if (Buffer.byteLength(apiV3Key, "utf8") !== 32) {
    throw new Error(`api_v3_key must be 32 bytes, got ${Buffer.byteLength(apiV3Key, "utf8")}`);
  }
  const nonce =
    nonceStr && Buffer.byteLength(nonceStr, "utf8") === 12
      ? nonceStr
      : randomBytes(12).toString("base64").slice(0, 12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(nonce, "utf8"),
  );
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const enc = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    nonce,
    associated_data: associatedData,
  };
}

export function aesGcmDecrypt(apiV3Key, ciphertextB64, nonceStr, associatedData = "") {
  const key = Buffer.from(apiV3Key, "utf8");
  const buf = Buffer.from(ciphertextB64, "base64");
  const data = buf.subarray(0, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonceStr, "utf8"),
  );
  if (associatedData) decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Build a WeChat APIv3 notify HTTP payload (headers + JSON body) signed by platform key.
 */
export function buildSignedNotifyRequest(opts) {
  const {
    platformPrivateKeyPem,
    platformSerialNo,
    apiV3Key,
    transaction,
    timestampSec = Math.floor(Date.now() / 1000),
    nonce = randomUUID().replace(/-/g, ""),
  } = opts;

  const resourcePlain = JSON.stringify(transaction);
  const enc = aesGcmEncrypt(apiV3Key, resourcePlain, "transaction");
  const bodyObj = {
    id: randomUUID().replace(/-/g, ""),
    create_time: new Date().toISOString(),
    resource_type: "encrypt-resource",
    event_type: "TRANSACTION.SUCCESS",
    summary: "支付成功",
    resource: {
      algorithm: "AEAD_AES_256_GCM",
      ciphertext: enc.ciphertext,
      nonce: enc.nonce,
      associated_data: enc.associated_data,
      original_type: "transaction",
    },
  };
  const body = JSON.stringify(bodyObj);
  const message = `${timestampSec}\n${nonce}\n${body}\n`;
  const signature = signMessageWithPrivateKey(message, platformPrivateKeyPem);

  return {
    body,
    bodyObj,
    headers: {
      "content-type": "application/json",
      "Wechatpay-Timestamp": String(timestampSec),
      "Wechatpay-Nonce": nonce,
      "Wechatpay-Signature": signature,
      "Wechatpay-Serial": platformSerialNo,
      "Wechatpay-Signature-Type": "WECHATPAY2-SHA256-RSA2048",
    },
    message,
    signature,
  };
}

export function sampleTransaction(overrides = {}) {
  return {
    mchid: "1900000001",
    appid: "wx_test_appid_e2e",
    out_trade_no: "TRADE_PLACEHOLDER",
    transaction_id: `wx_tx_${Date.now()}`,
    trade_type: "NATIVE",
    trade_state: "SUCCESS",
    trade_state_desc: "支付成功",
    success_time: new Date().toISOString(),
    amount: { total: 1, currency: "CNY" },
    ...overrides,
  };
}
