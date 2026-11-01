import { describe, expect, test } from "bun:test";
import { createApp } from "../../src/api/app";
import { db, queryClient } from "../../src/db";
import { logger } from "../../src/lib/logger";

describe("GET /health", () => {
  test("healthy db 200 HTTP code", async () => {
    const app = createApp({ db, logger });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  test("unhealhy db 503 http code", async () => {
    const app = createApp({ db, logger });
    await queryClient.end();

    const res = await app.request("/health");
    expect(res.status).toBe(503);
  });
});
