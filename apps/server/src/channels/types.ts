import type { Order } from "../db/schema.js";

export type ChannelPrecreateInput = {
  order: Order;
  subject: string;
  /** Absolute notify URL for channel */
  notifyUrl: string;
  returnUrl?: string;
};

export type ChannelPrecreateResult = {
  payurl: string;
  qrcode: string;
  channelTradeNo?: string;
  raw?: unknown;
};

export type ChannelNotifyResult = {
  ok: boolean;
  /** Platform out_trade_no we sent to channel (our trade_no) */
  tradeNo?: string;
  channelTradeNo?: string;
  amountCents?: number;
  tradeStatus?: string;
  raw?: Record<string, string>;
  responseBody: string;
};

export interface PaymentChannel {
  readonly name: "alipay" | "wxpay";
  precreate(input: ChannelPrecreateInput): Promise<ChannelPrecreateResult>;
  verifyNotify(payload: Record<string, string>): Promise<ChannelNotifyResult>;
}
