import { createHash } from "node:crypto";

export type SignParams = Record<string, string | number | null | undefined>;

/** Classic YiPay/epay MD5 sign: non-empty params except sign/sign_type, ASCII sort, k=v&..., md5(src+KEY) lowercase. */
export function buildSignSource(params: SignParams): string {
  const pairs: string[] = [];
  for (const key of Object.keys(params).sort()) {
    if (key === "sign" || key === "sign_type") continue;
    const raw = params[key];
    if (raw === undefined || raw === null) continue;
    const value = String(raw);
    if (value === "") continue;
    pairs.push(`${key}=${value}`);
  }
  return pairs.join("&");
}

export function signMd5(params: SignParams, key: string): string {
  const src = buildSignSource(params);
  return createHash("md5").update(src + key, "utf8").digest("hex");
}

export function verifyMd5(params: SignParams, key: string): boolean {
  const provided = params.sign;
  if (provided === undefined || provided === null || String(provided) === "") {
    return false;
  }
  const expected = signMd5(params, key);
  return expected === String(provided).toLowerCase();
}

/** Convert decimal money string (e.g. 1.00 / 0.01) to integer cents. */
export function moneyToCents(money: string | number): number {
  const s = String(money).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error("invalid money format");
  }
  const [yuan, frac = ""] = s.split(".");
  const cents = Number(yuan) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("money must be positive");
  }
  return cents;
}

export function centsToMoney(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("invalid cents");
  }
  const neg = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${neg}${yuan}.${String(rem).padStart(2, "0")}`;
}
