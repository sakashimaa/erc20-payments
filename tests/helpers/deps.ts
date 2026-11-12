import type { AppDeps } from "../../src/api/app";
import { db } from "../../src/db";
import {
  createCipher,
  createFingerprinter,
  importDataKey,
  importHmacKey,
} from "../../src/lib/crypto";
import { logger } from "../../src/lib/logger";

const key = (fill: number) => Buffer.alloc(32, fill).toString("base64");

export const TEST_ADMIN_TOKEN = "test-admin-token-0123456789abcdef0123456789";

const cipher = createCipher(await importDataKey(key(1)), 1);
const fingerprinter = createFingerprinter(await importHmacKey(key(2)));

export const createDeps = (overrides: Partial<AppDeps> = {}): AppDeps => ({
  db,
  logger,
  cipher,
  fingerprinter,
  allowInsecureWebhooks: false,
  adminToken: TEST_ADMIN_TOKEN,
  ...overrides,
});
