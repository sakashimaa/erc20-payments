import { describe, test, expect, beforeEach } from "bun:test";
import { createApp } from "../../src/api/app";
import { createDeps } from "../helpers/deps";
import { post } from "../helpers/api";
import {
  CreateMerchantResponse,
  RotateMerchantResponse,
} from "../schemas/merchant";
import { validMerchantBody } from "../helpers/merchant";
import { truncateAll } from "../helpers/db";

beforeEach(async () => {
  await truncateAll();
});

const invalidTokenResponse = {
  error: {
    code: "unauthorized",
    message: "invalid auth token",
  },
};

const USDT_TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

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

    const res = await post(
      app,
      "/api/invoices",
      undefined,
      authHeader !== undefined ? authHeader : undefined,
    );

    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toMatchObject({
      error: {
        code: "unauthorized",
        message: expectedMessage,
      },
    });
  });

  test("rotated key gives 401, new 201", async () => {
    const deps = createDeps({ allowInsecureWebhooks: true });
    const app = createApp(deps);

    const merchant = await post(
      app,
      "/api/merchants",
      { ...validMerchantBody() },
      deps.adminToken,
    );

    const { apiKey: old, merchantId } = CreateMerchantResponse.parse(
      await merchant.json(),
    );
    expect(merchant.status).toBe(201);

    const rotated = await post(
      app,
      `/api/merchants/${merchantId}/rotate`,
      undefined,
      deps.adminToken,
    );

    const { apiKey } = RotateMerchantResponse.parse(await rotated.json());
    expect(rotated.status).toBe(200);

    const invoiceRotated = await post(app, "/api/invoices", undefined, old);

    expect(invoiceRotated.status).toBe(401);
    expect(await invoiceRotated.json()).toMatchObject(invalidTokenResponse);

    const invoiceCorrect = await post(
      app,
      "/api/invoices",
      {
        merchantOrderId: crypto.randomUUID(),
        chainId: deps.supportedChainIds.values().next().value,
        tokenAddress: USDT_TOKEN,
        amount: "1000000",
      },
      apiKey,
    );

    expect(invoiceCorrect.status).toBe(201);
  });

  test("correct middleware order", async () => {
    const app = createApp(createDeps());

    const result = await post(
      app,
      "/api/invoices",
      { merchantOrderId: "", tokenAddress: "de jure" },
      "qwerty123",
    );

    expect(result.status).toBe(401);
    expect(await result.json()).toMatchObject(invalidTokenResponse);
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

    const invoice = await post(
      app,
      "/api/invoices",
      undefined,
      `${splitted.join("_")}_${"a".repeat(64)}`,
    );
    expect(invoice.status).toBe(401);
    expect(await invoice.json()).toMatchObject(invalidTokenResponse);
  });
});
