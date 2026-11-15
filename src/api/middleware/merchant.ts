import { createMiddleware } from "hono/factory";
import { parseAuthToken } from "../utils/api";
import { UnauthorizedError } from "../utils/http-error";
import type { AppDeps } from "../app";
import { apiKeys } from "../../db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { parseApiKey, verifyApiKey } from "../../lib/api-keys";

export type MerchantEnv = { Variables: { merchantId: string } };

export const requireApiKey = ({ db }: AppDeps) =>
  createMiddleware<MerchantEnv>(async (c, next) => {
    const token = parseAuthToken(c);

    const parsed = parseApiKey(token);
    if (!parsed) throw new UnauthorizedError("invalid auth token");

    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.prefix, parsed.prefix), isNull(apiKeys.revokedAt)));
    if (!apiKey || !(await verifyApiKey(token, apiKey.keyHash)))
      throw new UnauthorizedError("invalid auth token");

    c.set("merchantId", apiKey.merchantId);
    await next();
  });
