import { createMiddleware } from "hono/factory";

export const noStore = createMiddleware(async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
});
