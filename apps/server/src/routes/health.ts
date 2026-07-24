import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    return {
      ok: true,
      service: env.appName,
      env: env.appEnv,
      time: new Date().toISOString(),
    };
  });
}
