/**
 * Deterministic fixtures for WeChat Pay APIv3 crypto (no network).
 * RSA keypair generated once offline for tests — not production secrets.
 */
import { createCipheriv, generateKeyPairSync, randomBytes } from "node:crypto";
import {
  buildAuthorizationHeader,
  buildMessage,
  decryptAes256Gcm,
  parseAndDecryptNotify,
  signSha256Rsa,
  verifyNotifySignature,
  verifySha256Rsa,
  assertTransactionMatchesOrder,
  type WechatNotifyHeaders,
} from "../src/channels/wechat-api-v3.js";
import type { Order } from "../src/db/index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const API_V3_KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes
const MCH_ID = "1900000109";
const APP_ID = "wxd678efh567hg6787";
const SERIAL = "TESTSERIAL001";

function encryptAes256Gcm(
  plain: string,
  apiV3Key: string,
  associatedData: string,
  nonce: string,
): string {
  const key = Buffer.from(apiV3Key, "utf8");
  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonce, "utf8"),
  );
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const enc = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([enc, tag]).toString("base64");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sampleOrder(over: Partial<Order> = {}): Order {
  const now = Date.now();
  return {
    id: 1,
    tradeNo: "T202601010001",
    outTradeNo: "OUT1",
    merchantId: 1,
    channel: "wxpay",
    name: "test",
    amountCents: 100,
    status: "pending",
    notifyUrl: "https://merchant.example/notify",
    returnUrl: null,
    param: null,
    clientIp: null,
    payUrl: null,
    qrCode: null,
    channelTradeNo: null,
    paidAt: null,
    notifyStatus: "none",
    notifyTimes: 0,
    nextNotifyAt: null,
    createdAt: now,
    updatedAt: now,
    expiredAt: null,
    ...over,
  } as Order;
}

async function main() {
  // 1) Request Authorization signature deterministic verify
  const body = JSON.stringify({
    appid: APP_ID,
    mchid: MCH_ID,
    description: "fixture",
    out_trade_no: "T202601010001",
    notify_url: "https://pay.example.com/channels/wxpay/notify",
    amount: { total: 100, currency: "CNY" },
  });
  const ts = "1700000000";
  const nonce = "fixednonce001";
  const msg = buildMessage("POST", "/v3/pay/transactions/native", ts, nonce, body);
  const sig = signSha256Rsa(msg, privateKey);
  assert(verifySha256Rsa(msg, sig, publicKey), "request sign verify failed");

  const auth = buildAuthorizationHeader({
    mchId: MCH_ID,
    serialNo: SERIAL,
    privateKeyPem: privateKey,
    method: "POST",
    urlPath: "/v3/pay/transactions/native",
    body,
    timestamp: ts,
    nonce,
  });
  assert(
    auth.authorization.includes("WECHATPAY2-SHA256-RSA2048"),
    "auth scheme",
  );
  assert(auth.authorization.includes(`mchid="${MCH_ID}"`), "auth mchid");
  assert(auth.signature === sig, "auth signature matches");

  // 2) Notify platform signature + AES-GCM decrypt
  const txPlain = JSON.stringify({
    appid: APP_ID,
    mchid: MCH_ID,
    out_trade_no: "T202601010001",
    transaction_id: "4200000000000000001",
    trade_state: "SUCCESS",
    amount: { total: 100, currency: "CNY" },
  });
  const resourceNonce = randomBytes(12).toString("base64").slice(0, 12);
  const associated = "transaction";
  const ciphertext = encryptAes256Gcm(
    txPlain,
    API_V3_KEY,
    associated,
    resourceNonce,
  );
  const notifyBodyObj = {
    id: "EV-1",
    resource_type: "encrypt-resource",
    event_type: "TRANSACTION.SUCCESS",
    resource: {
      algorithm: "AEAD_AES_256_GCM",
      ciphertext,
      associated_data: associated,
      nonce: resourceNonce,
      original_type: "transaction",
    },
  };
  const rawBody = JSON.stringify(notifyBodyObj);
  const nts = String(Math.floor(Date.now() / 1000));
  const nnonce = "notifynonce001";
  const nmsg = `${nts}\n${nnonce}\n${rawBody}\n`;
  const nsig = signSha256Rsa(nmsg, privateKey); // platform key = same fixture keypair

  assert(
    verifyNotifySignature({
      timestamp: nts,
      nonce: nnonce,
      body: rawBody,
      signature: nsig,
      platformPublicKeyPem: publicKey,
    }),
    "notify sign ok",
  );

  // replay window reject
  assert(
    !verifyNotifySignature({
      timestamp: String(Math.floor(Date.now() / 1000) - 10_000),
      nonce: nnonce,
      body: rawBody,
      signature: signSha256Rsa(
        `${Math.floor(Date.now() / 1000) - 10_000}\n${nnonce}\n${rawBody}\n`,
        privateKey,
      ),
      platformPublicKeyPem: publicKey,
    }),
    "stale timestamp must fail",
  );

  const headers: WechatNotifyHeaders = {
    timestamp: nts,
    nonce: nnonce,
    signature: nsig,
    serial: SERIAL,
  };
  const tx = parseAndDecryptNotify(rawBody, headers, {
    apiV3Key: API_V3_KEY,
    platformPublicKeyPem: publicKey,
  });
  assert(tx.out_trade_no === "T202601010001", "decrypt out_trade_no");
  assert(tx.amount?.total === 100, "decrypt amount");

  // 3) Business validation
  const order = sampleOrder();
  assertTransactionMatchesOrder(tx, order, { mchId: MCH_ID, appId: APP_ID });

  let amountRejected = false;
  try {
    assertTransactionMatchesOrder(
      { ...tx, amount: { total: 1, currency: "CNY" } },
      order,
      { mchId: MCH_ID, appId: APP_ID },
    );
  } catch {
    amountRejected = true;
  }
  assert(amountRejected, "amount mismatch must throw");

  // 4) AES unit
  const round = decryptAes256Gcm({
    apiV3Key: API_V3_KEY,
    associatedData: associated,
    nonce: resourceNonce,
    ciphertextBase64: ciphertext,
  });
  assert(round === txPlain, "aes roundtrip");

  console.log("PASS wechat-apiv3 fixtures");
}

main().catch((err) => {
  console.error("FAIL wechat-apiv3 fixtures", err);
  process.exit(1);
});
