import type { Client } from "@libsql/client";

/** Idempotent SQL migrations for MVP (no external migrate CLI required). */
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pid TEXT NOT NULL,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS merchants_pid_uq ON merchants(pid);

CREATE TABLE IF NOT EXISTS channel_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id INTEGER REFERENCES merchants(id),
  channel TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
);
CREATE INDEX IF NOT EXISTS channel_configs_channel_idx ON channel_configs(channel);
CREATE UNIQUE INDEX IF NOT EXISTS channel_configs_merchant_channel_uq ON channel_configs(merchant_id, channel);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_no TEXT NOT NULL,
  out_trade_no TEXT NOT NULL,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  channel TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  channel_trade_no TEXT,
  paid_at INTEGER,
  notify_status TEXT NOT NULL DEFAULT 'none',
  notify_url TEXT NOT NULL DEFAULT '',
  return_url TEXT NOT NULL DEFAULT '',
  param TEXT NOT NULL DEFAULT '',
  client_ip TEXT,
  pay_url TEXT,
  qr_code TEXT,
  expired_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_trade_no_uq ON orders(trade_no);
CREATE UNIQUE INDEX IF NOT EXISTS orders_merchant_out_trade_no_uq ON orders(merchant_id, out_trade_no);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_notify_status_idx ON orders(notify_status);

CREATE TABLE IF NOT EXISTS notify_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  attempt_no INTEGER NOT NULL,
  http_status INTEGER,
  response_body TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
);
CREATE INDEX IF NOT EXISTS notify_attempts_order_idx ON notify_attempts(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS notify_attempts_order_attempt_uq ON notify_attempts(order_id, attempt_no);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_uq ON admin_users(username);
`,
  },
];

export async function migrate(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
    );
  `);

  for (const m of MIGRATIONS) {
    const existing = await client.execute({
      sql: "SELECT id FROM __migrations WHERE id = ?",
      args: [m.id],
    });
    if (existing.rows.length > 0) continue;

    await client.executeMultiple(m.sql);
    await client.execute({
      sql: "INSERT INTO __migrations (id) VALUES (?)",
      args: [m.id],
    });
  }
}
