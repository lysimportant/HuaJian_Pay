import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";
import type { Order } from "../db/index.js";

/** Official WeChat Pay merchant APIv3 host (Native). */
export const WECHAT_API_HOST = "https://api.mch.weixin.qq.com";
export const WECHAT_NATIVE_PATH = "/v3/pay/transactions/native";

export type WechatApiV3Config = {
  mchId: string;
  appId: string;
  apiV3Key: string;
  merchantPrivateKeyPem: string;
  merchantSerialNo: string;
  /** WeChat platform certificate or public key PEM (for notify signature verify). */
  platformPublicKeyPem: string;
  notifyUrl: string;
};

export type WechatNativePrecreateInput = {
  order: Order;
  description: string;
  notifyUrl?: string;
};

export type WechatNativePrecreateResult = {
  codeUrl: string;
  raw?: unknown;
};

export type WechatNotifyHeaders = {
  timestamp: string;
  nonce: string;
  signature: string;
  serial: string;
};

export type WechatNotifyResource = {
  original_type?: string;
  algorithm: string;
  ciphertext: string;
  associated_data?: string;
  nonce: string;
};

export type WechatNotifyBody = {
  id?: string;
  create_time?: string;
  resource_type?: string;
  event_type?: string;
  summary?: string;
  resource: WechatNotifyResource;
};

export type WechatTransaction = {
  appid?: string;
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  trade_state_desc?: string;
  success_time?: string;
  amount?: {
    total?: number;
    payer_total?: number;
    currency?: string;
  };
};

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(normalizePem(pem));
}

export function loadPublicKey(pem: string): KeyObject {
  return createPublicKey(normalizePem(pem));
}

/**
 * APIv3 request Authorization signature message:
 * `${method}\n${urlPathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`
 */
export function buildMessage(
  method: string,
  urlPath: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
}

export function signSha256Rsa(
  message: string,
  privateKeyPem: string,
): string {
  const key = loadPrivateKey(privateKeyPem);
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(key, "base64");
}

export function verifySha256Rsa(
  message: string,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    const key = loadPublicKey(publicKeyPem);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(message);
    verifier.end();
    return verifier.verify(key, signatureBase64, "base64");
  } catch {
    return false;
  }
}

export function buildAuthorizationHeader(params: {
  mchId: string;
  serialNo: string;
  privateKeyPem: string;
  method: string;
  urlPath: string;
  body: string;
  timestamp?: string;
  nonce?: string;
}): { authorization: string; timestamp: string; nonce: string; signature: string } {
  const timestamp = params.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = params.nonce ?? randomBytes(16).toString("hex");
  const message = buildMessage(
    params.method,
    params.urlPath,
    timestamp,
    nonce,
    params.body,
  );
  const signature = signSha256Rsa(message, params.privateKeyPem);
  const authorization =
    `WECHATPAY2-SHA256-RSA2048 mchid="${params.mchId}",` +
    `nonce_str="${nonce}",` +
    `signature="${signature}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${params.serialNo}"`;
  return { authorization, timestamp, nonce, signature };
}

/**
 * Decrypt APIv3 notify resource (AES-256-GCM).
 * Key = API v3 key (32 bytes UTF-8).
 */
export function decryptAes256Gcm(params: {
  apiV3Key: string;
  associatedData: string;
  nonce: string;
  ciphertextBase64: string;
}): string {
  const key = Buffer.from(params.apiV3Key, "utf8");
  if (key.length !== 32) {
    throw new Error("WECHAT_APIV3_KEY must be 32 bytes");
  }
  const data = Buffer.from(params.ciphertextBase64, "base64");
  // ciphertext || authTag(16)
  if (data.length <= 16) {
    throw new Error("invalid wechat ciphertext");
  }
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(params.nonce, "utf8"),
  );
  decipher.setAuthTag(authTag);
  if (params.associatedData) {
    decipher.setAAD(Buffer.from(params.associatedData, "utf8"));
  }
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function verifyNotifySignature(params: {
  timestamp: string;
  nonce: string;
  body: string;
  signature: string;
  platformPublicKeyPem: string;
  /** Reject if |now - timestamp| > maxSkewSec (replay window). Default 300s. */
  maxSkewSec?: number;
  nowSec?: number;
}): boolean {
  const maxSkew = params.maxSkewSec ?? 300;
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);
  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > maxSkew) {
    return false;
  }
  const message = `${params.timestamp}\n${params.nonce}\n${params.body}\n`;
  return verifySha256Rsa(
    message,
    params.signature,
    params.platformPublicKeyPem,
  );
}

export function parseAndDecryptNotify(
  rawBody: string,
  headers: WechatNotifyHeaders,
  cfg: Pick<WechatApiV3Config, "apiV3Key" | "platformPublicKeyPem">,
  opts?: { maxSkewSec?: number; nowSec?: number },
): WechatTransaction {
  const ok = verifyNotifySignature({
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    body: rawBody,
    signature: headers.signature,
    platformPublicKeyPem: cfg.platformPublicKeyPem,
    maxSkewSec: opts?.maxSkewSec,
    nowSec: opts?.nowSec,
  });
  if (!ok) {
    throw Object.assign(new Error("wechat notify signature invalid"), {
      code: "SIGN_INVALID",
    });
  }

  let parsed: WechatNotifyBody;
  try {
    parsed = JSON.parse(rawBody) as WechatNotifyBody;
  } catch {
    throw Object.assign(new Error("wechat notify body not json"), {
      code: "BODY_INVALID",
    });
  }
  if (!parsed.resource?.ciphertext || !parsed.resource?.nonce) {
    throw Object.assign(new Error("wechat notify resource missing"), {
      code: "RESOURCE_MISSING",
    });
  }
  if (
    parsed.resource.algorithm &&
    parsed.resource.algorithm !== "AEAD_AES_256_GCM"
  ) {
    throw Object.assign(new Error("unsupported wechat notify algorithm"), {
      code: "ALG_UNSUPPORTED",
    });
  }

  const plain = decryptAes256Gcm({
    apiV3Key: cfg.apiV3Key,
    associatedData: parsed.resource.associated_data || "",
    nonce: parsed.resource.nonce,
    ciphertextBase64: parsed.resource.ciphertext,
  });

  return JSON.parse(plain) as WechatTransaction;
}

export function assertTransactionMatchesOrder(
  tx: WechatTransaction,
  order: Order,
  cfg: Pick<WechatApiV3Config, "mchId" | "appId">,
): void {
  // P0: required identity fields must be present and match (missing ≠ skip check).
  if (!tx.mchid || tx.mchid !== cfg.mchId) {
    throw Object.assign(new Error("mchid mismatch"), { code: "MCH_MISMATCH" });
  }
  if (!tx.appid || tx.appid !== cfg.appId) {
    throw Object.assign(new Error("appid mismatch"), { code: "APP_MISMATCH" });
  }
  // out_trade_no for WeChat is our platform trade_no
  if (!tx.out_trade_no || tx.out_trade_no !== order.tradeNo) {
    throw Object.assign(new Error("out_trade_no mismatch"), {
      code: "OUT_TRADE_NO_MISMATCH",
    });
  }
  if (
    tx.amount?.total === undefined ||
    tx.amount.total === null ||
    tx.amount.total !== order.amountCents
  ) {
    throw Object.assign(new Error("amount mismatch"), {
      code: "AMOUNT_MISMATCH",
    });
  }
  const currency = (tx.amount.currency || "").toUpperCase();
  if (currency !== "CNY") {
    throw Object.assign(new Error("currency mismatch"), {
      code: "CURRENCY_MISMATCH",
    });
  }
  const state = (tx.trade_state || "").toUpperCase();
  if (state !== "SUCCESS") {
    throw Object.assign(new Error(`trade_state not success: ${state || "missing"}`), {
      code: "STATE_NOT_SUCCESS",
    });
  }
}

export async function nativePrecreate(
  cfg: WechatApiV3Config,
  input: WechatNativePrecreateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<WechatNativePrecreateResult> {
  if (!cfg.mchId || !cfg.appId || !cfg.merchantPrivateKeyPem || !cfg.merchantSerialNo) {
    throw new Error("wechat APIv3 credentials incomplete");
  }
  if (!cfg.apiV3Key || cfg.apiV3Key.length !== 32) {
    throw new Error("WECHAT_APIV3_KEY must be 32 characters");
  }

  const notifyUrl = input.notifyUrl || cfg.notifyUrl;
  const bodyObj = {
    appid: cfg.appId,
    mchid: cfg.mchId,
    description: input.description.slice(0, 127),
    out_trade_no: input.order.tradeNo,
    notify_url: notifyUrl,
    amount: {
      total: input.order.amountCents,
      currency: "CNY",
    },
  };
  const body = JSON.stringify(bodyObj);
  const { authorization } = buildAuthorizationHeader({
    mchId: cfg.mchId,
    serialNo: cfg.merchantSerialNo,
    privateKeyPem: cfg.merchantPrivateKeyPem,
    method: "POST",
    urlPath: WECHAT_NATIVE_PATH,
    body,
  });

  const res = await fetchImpl(`${WECHAT_API_HOST}${WECHAT_NATIVE_PATH}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "HuaJian_Pay/wechat-apiv3",
    },
    body,
  });

  const text = await res.text();
  let json: { code_url?: string; code?: string; message?: string } = {};
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    /* keep raw */
  }
  if (!res.ok || !json.code_url) {
    throw new Error(
      `wechat native precreate failed: HTTP ${res.status} ${json.message || text.slice(0, 200)}`,
    );
  }
  return { codeUrl: json.code_url, raw: json };
}

/** Timing-safe string equality for serial / token compares. */
export function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
