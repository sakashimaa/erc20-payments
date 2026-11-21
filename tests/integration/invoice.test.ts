import { describe, test, expect, beforeEach } from "bun:test";
import { createApp } from "../../src/api/app";
import { createDeps } from "../helpers/deps";
import { post } from "../helpers/api";
import { CreateMerchantResponse } from "../schemas/merchant";
import { validMerchantBody } from "../helpers/merchant";
import { truncateAll } from "../helpers/db";

beforeEach(async () => {
  await truncateAll();
});

describe("requireApiKey middleware", () => {
  test.each([
    ["no authorization header", undefined, "invalid token"],
    ["invalid format", "xxx", "invalid auth token"],
    [
      "unknown prefix",
      `sk_live_${"a".repeat(16)}_${"b".repeat(64)}`,
      "invalid auth token",
    ],
  ])("POST /invoices %s -> 401", async (_, authHeader, expectedMessage) => {
    const app = createApp(createDeps());

    const res = await app.request("/api/invoices", {
      method: "POST",
      headers: {
        ...(authHeader !== undefined
          ? { Authorization: `Bearer ${authHeader}` }
          : {}),
      },
    });

    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toMatchObject({
      error: {
        code: "unauthorized",
        message: expectedMessage,
      },
    });
  });

  test("existing prefix, corrupted secret", async () => {
    const deps = createDeps({ allowInsecureWebhooks: true });
    const app = createApp(deps);

    const merchant = await post(
      app,
      "/api/merchants",
      { ...validMerchantBody() },
      deps.adminToken,
    );

    const json = CreateMerchantResponse.parse(await merchant.json());
    const splitted = json.apiKey.split("_").slice(0, 3);

    const invoice = await app.request("/api/invoices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${splitted.join("_")}_${"a".repeat(64)}`,
      },
    });
    expect(invoice.status).toBe(401);
    expect(await invoice.json()).toMatchObject({
      error: {
        code: "unauthorized",
        message: "invalid auth token",
      },
    });
  });
});
