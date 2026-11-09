import type { Hono } from "hono";
import { expect } from "bun:test";

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

export const matchObjectJson = async (res: Response, match: object) => {
  const json = await res.json();
  expect(json).toMatchObject(match);
};
