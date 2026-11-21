import type { Logger } from "pino";
import type { DB } from "../db";
import { Hono } from "hono";
import { healthRoutes } from "./routes/health";
import { merchantRoutes } from "./routes/merchant";
import type { Cipher, Fingerprinter } from "../lib/crypto";
import { createErrorHandler } from "./middleware/error";
import { invoiceRoutes } from "./routes/invoice";
import { bodyLimit } from "hono/body-limit";

export type AppDeps = {
  db: DB;
  logger: Logger;
  cipher: Cipher;
  fingerprinter: Fingerprinter;
  allowInsecureWebhooks: boolean;
  adminToken: string;
  supportedChainIds: ReadonlySet<number>;
};

export const createApp = (deps: AppDeps) => {
  const app = new Hono();
  app.route("/", healthRoutes(deps));

  const api = new Hono()
    .route("/merchants", merchantRoutes(deps))
    .route("/invoices", invoiceRoutes(deps));

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) =>
        c.json(
          {
            error: {
              code: "payload_too_large",
              message: "json payload is too big",
            },
          },
          413,
        ),
    }),
  );
  app.route("/api", api);

  app.onError(createErrorHandler(deps.logger));

  return app;
};
