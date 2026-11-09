import postgres from "postgres";
import { env } from "../src/config/base-env";
import { runMigrations } from "../src/db/migrate";
import { afterAll } from "bun:test";
import { queryClient } from "../src/db";

const url = new URL(env.DATABASE_URL);
const dbName = url.pathname.slice(1);

if (env.NODE_ENV !== "test" || !/^[a-z0-9_]+_test$/.test(dbName)) {
  throw new Error(`refusing to run tests against ${dbName}`);
}

const adminUrl = new URL(url);

adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.href, { max: 1 });

await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${dbName}`);

await admin.end();

await runMigrations(env.DATABASE_URL);

afterAll(() => queryClient.end());
