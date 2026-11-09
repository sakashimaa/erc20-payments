import { createMiddleware } from "hono/factory";
import { safeEqual } from "../../lib/api-keys";

export const requireAdmin = (adminToken: string) =>
  createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return c.json(
        {
          error: { code: "unauthorized", message: "invalid header format" },
        },
        401,
      );

    const token = authHeader.slice("Bearer ".length);

    if (!safeEqual(token, adminToken))
      return c.json(
        {
          error: { code: "unauthorized", message: "invalid token" },
        },
        401,
      );

    await next();
  });
