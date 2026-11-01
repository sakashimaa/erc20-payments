import { Hono } from "hono";
import { env } from "../config/api-env";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const app = new Hono();
app.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "healthy" }, 200);
  } catch (err) {
    logger.error({ err }, "unhealhy db");

    return c.json({ status: "unhealthy", message: "db is not available" }, 500);
  }
});

export default {
  port: env.HTTP_PORT,
  fetch: app.fetch,
};
