import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { getClient } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    let dbOk = false;
    try {
      await getClient().execute("SELECT 1 AS ok");
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return {
      ok: dbOk,
      service: env.appName,
      env: env.appEnv,
      db: env.dbDriver,
      channelMode: env.channelMode,
      time: new Date().toISOString(),
    };
  });
}
