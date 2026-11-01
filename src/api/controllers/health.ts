import type { Context } from "hono";
import type { AppDeps } from "../app";
import { sql } from "drizzle-orm";

export const getHealth = ({ db, logger }: AppDeps) => {
  return async (c: Context) => {
    try {
      await db.execute(sql`SELECT 1`);

      return c.json({ status: "healthy" }, 200);
    } catch (err) {
      logger.error({ err }, "unhealhy db");

      return c.json(
        { status: "unhealthy", message: "db is not available" },
        503,
      );
    }
  };
};
