import { createMiddleware } from "hono/factory";
import { safeEqual } from "../../lib/api-keys";
import { invalidToken } from "./merchant";
import { parseAuthToken } from "../utils/api";
import { UnauthorizedError } from "../utils/http-error";

export const requireAdmin = (adminToken: string) =>
  createMiddleware(async (c, next) => {
    if (!safeEqual(parseAuthToken(c), adminToken))
      throw new UnauthorizedError("invalid auth token");

    await next();
  });
