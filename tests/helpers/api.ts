import type { Hono } from "hono";

export const post = (
  app: Hono,
  path: string,
  body: unknown,
  adminToken?: string,
) =>
  app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
