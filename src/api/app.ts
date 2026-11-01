import type { Logger } from "pino";
import type { DB } from "../db";
import { Hono } from "hono";
import { healthRoutes } from "./routes/health";

export type AppDeps = {
  db: DB;
  logger: Logger;
};

export const createApp = (deps: AppDeps) => {
  const app = new Hono();
  app.route("/", healthRoutes({ db: deps.db, logger: deps.logger }));

  return app;
};
