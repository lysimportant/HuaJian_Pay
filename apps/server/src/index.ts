import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ host: env.host, port: env.port });
    app.log.info(
      { url: env.appUrl, port: env.port, mode: env.channelMode },
      `${env.appName} server started`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
