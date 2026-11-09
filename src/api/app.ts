import type { Logger } from "pino";
import type { DB } from "../db";
import { Hono } from "hono";
import { healthRoutes } from "./routes/health";
import { merchantRoutes } from "./routes/merchant";
import type { Cipher, Fingerprinter } from "../lib/crypto";

export type AppDeps = {
  db: DB;
  logger: Logger;
  cipher: Cipher;
  fingerprinter: Fingerprinter;
  allowInsecureWebhooks: boolean;
  adminToken: string;
};

export const createApp = (deps: AppDeps) => {
  const app = new Hono();
  app.route("/", healthRoutes(deps));

  const api = new Hono().route("/merchants", merchantRoutes(deps));

  app.route("/api", api);

  return app;
};
