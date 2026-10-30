import postgres from "postgres";
import { env } from "../config/base-env";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient, {
  schema,
  casing: "snake_case",
  logger: env.NODE_ENV !== "production",
});

export { schema };

export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;
