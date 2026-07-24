import Fastify from "fastify";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.appEnv === "production" ? "info" : "debug",
    },
  });

  await app.register(healthRoutes);

  return app;
}
