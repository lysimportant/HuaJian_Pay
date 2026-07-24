import Fastify from "fastify";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.appEnv === "production" ? "info" : "debug",
    },
  });

  app.get("/", async () => ({
    name: env.appName,
    docs: "/health",
  }));

  await app.register(healthRoutes);

  return app;
}
