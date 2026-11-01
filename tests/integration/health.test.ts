import { describe, expect, test } from "bun:test";
import { createApp } from "../../src/api/app";
import { db } from "../../src/db";
import { logger } from "../../src/lib/logger";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

describe("GET /health", () => {
  test("healthy db 200 HTTP code", async () => {
    const app = createApp({ db, logger });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  test("unhealhy db 503 http code", async () => {
    const dead = postgres("postgres://x:x@127.0.0.1:1/x", {
      max: 1,
      connect_timeout: 1,
    });
    const app = createApp({ db: drizzle(dead), logger });

    const res = await app.request("/health");
    expect(res.status).toBe(503);
    await dead.end();
  });
});
