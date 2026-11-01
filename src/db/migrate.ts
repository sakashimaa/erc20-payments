import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { logger } from "../lib/logger.js";

const MIGRATIONS_FOLDER = new URL("../../drizzle", import.meta.url).pathname;

export const runMigrations = async (databaseUrl: string) => {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
};

if (import.meta.main) {
  const { env } = await import("../config/base-env.js");
  await runMigrations(env.DATABASE_URL);

  logger.info("migrations run successfully");
}
