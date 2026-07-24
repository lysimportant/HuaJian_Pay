import { getClient, getDb } from "./client.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

export async function initDb(): Promise<void> {
  const client = getClient();
  await migrate(client);
  await seed(getDb());
}

export { getClient, getDb } from "./client.js";
export * from "./schema.js";
export { hashPassword, verifyPassword } from "./seed.js";
