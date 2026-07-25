import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Unix epoch milliseconds as integer */
const ts = (name: string) =>
  integer(name, { mode: "number" })
    .notNull()
    .default(sql`(cast(strftime('%s','now') as integer) * 1000)`);

export const merchants = sqliteTable(
  "merchants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pid: text("pid").notNull(),
    name: text("name").notNull(),
    /** Merchant API secret (YiPay key). Stored plaintext for MVP sign verify. */
    apiKey: text("api_key").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("merchants_pid_uq").on(t.pid)],
);

export const channelConfigs = sqliteTable(
  "channel_configs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** null = platform-global channel config */
    merchantId: integer("merchant_id").references(() => merchants.id),
    channel: text("channel", { enum: ["alipay", "wxpay"] }).notNull(),
    /** JSON blob: app_id, keys, settle_account_label, etc. */
    configJson: text("config_json").notNull().default("{}"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    index("channel_configs_channel_idx").on(t.channel),
    uniqueIndex("channel_configs_merchant_channel_uq").on(
      t.merchantId,
      t.channel,
    ),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tradeNo: text("trade_no").notNull(),
    outTradeNo: text("out_trade_no").notNull(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchants.id),
    channel: text("channel", { enum: ["alipay", "wxpay"] }).notNull(),
    name: text("name").notNull().default(""),
    /** Integer cents */
    amountCents: integer("amount_cents").notNull(),
    status: text("status", {
      enum: ["pending", "paid", "expired", "closed"],
    })
      .notNull()
      .default("pending"),
    channelTradeNo: text("channel_trade_no"),
    paidAt: integer("paid_at", { mode: "number" }),
    notifyStatus: text("notify_status", {
      enum: ["none", "pending", "ok", "retrying", "failed"],
    })
      .notNull()
      .default("none"),
    notifyUrl: text("notify_url").notNull().default(""),
    returnUrl: text("return_url").notNull().default(""),
    param: text("param").notNull().default(""),
    clientIp: text("client_ip"),
    payUrl: text("pay_url"),
    qrCode: text("qr_code"),
    expiredAt: integer("expired_at", { mode: "number" }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("orders_trade_no_uq").on(t.tradeNo),
    uniqueIndex("orders_merchant_out_trade_no_uq").on(
      t.merchantId,
      t.outTradeNo,
    ),
    index("orders_status_idx").on(t.status),
    index("orders_notify_status_idx").on(t.notifyStatus),
  ],
);

export const notifyAttempts = sqliteTable(
  "notify_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    attemptNo: integer("attempt_no").notNull(),
    httpStatus: integer("http_status"),
    responseBody: text("response_body"),
    success: integer("success", { mode: "boolean" }).notNull().default(false),
    nextRetryAt: integer("next_retry_at", { mode: "number" }),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("notify_attempts_order_idx").on(t.orderId),
    uniqueIndex("notify_attempts_order_attempt_uq").on(t.orderId, t.attemptNo),
  ],
);

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Display name for UI; optional. */
    displayName: text("display_name").notNull().default(""),
    role: text("role", { enum: ["admin", "viewer"] }).notNull().default("admin"),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    /**
     * Bumped on password change / forced logout so existing Bearer tokens fail.
     * Embedded in token as `tv` and checked against DB on each request.
     */
    tokenVersion: integer("token_version").notNull().default(0),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("admin_users_username_uq").on(t.username)],
);

export type Merchant = typeof merchants.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type ChannelConfig = typeof channelConfigs.$inferSelect;
export type NotifyAttempt = typeof notifyAttempts.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
