import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env, REPO_ROOT } from "../config/env.js";
import * as schema from "./schema.js";

export type Db = LibSQLDatabase<typeof schema>;

let client: Client | null = null;
let db: Db | null = null;

function resolveSqliteUrl(dsn: string): string {
  if (dsn.startsWith("file:") || dsn.startsWith("libsql:")) {
    return dsn;
  }

  const absolute = path.isAbsolute(dsn)
    ? dsn
    : path.resolve(REPO_ROOT, dsn.replace(/^\.\//, ""));

  mkdirSync(path.dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

export function getClient(): Client {
  if (!client) {
    if (env.dbDriver !== "sqlite") {
      throw new Error(`Unsupported DB_DRIVER=${env.dbDriver} (MVP is sqlite)`);
    }
    client = createClient({ url: resolveSqliteUrl(env.dbDsn) });
  }
  return client;
}

export function getDb(): Db {
  if (!db) {
    db = drizzle(getClient(), { schema });
  }
  return db;
}
