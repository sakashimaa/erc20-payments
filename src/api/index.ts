import { env } from "../config/api-env";
import { db } from "../db";
import {
  createCipher,
  createFingerprinter,
  importDataKey,
  importHmacKey,
} from "../lib/crypto";
import { logger } from "../lib/logger";
import { createApp } from "./app";

const cipher = createCipher(
  await importDataKey(env.DATA_ENC_KEY),
  env.DATA_ENC_KEY_VERSION,
);
const fingerprinter = createFingerprinter(
  await importHmacKey(env.XPUB_FINGERPRINT_KEY),
);

const app = createApp({
  db,
  logger,
  cipher,
  fingerprinter,
  allowInsecureWebhooks: env.NODE_ENV === "development",
  adminToken: env.ADMIN_TOKEN,
});

export default {
  port: env.HTTP_PORT,
  fetch: app.fetch,
};
