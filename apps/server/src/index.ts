import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { initDb } from "./db/index.js";
import { startNotifyWorker } from "./pay/notify.js";

async function main(): Promise<void> {
  await initDb();
  startNotifyWorker(5000);

  const app = await buildApp();

  try {
    await app.listen({ host: env.host, port: env.port });
    app.log.info(
      {
        url: env.appUrl,
        port: env.port,
        mode: env.channelMode,
        db: env.dbDriver,
      },
      `${env.appName} server started`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
