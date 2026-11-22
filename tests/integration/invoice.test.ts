import { describe, test, expect, beforeEach } from "bun:test";
import { createApp, type AppDeps } from "../../src/api/app";
import { createDeps } from "../helpers/deps";
import { post } from "../helpers/api";
import {
  CreateMerchantResponse,
  RotateMerchantResponse,
} from "../schemas/merchant";
import {
  validMerchantBody,
  type CreateMerchantBody,
} from "../helpers/merchant";
import { truncateAll } from "../helpers/db";
import { validInvoice, type CreateInvoiceBody } from "../helpers/invoice";
import { HttpErrorResponseSchema } from "../schemas/error";
import type { Hono } from "hono";
import { maxUint256 } from "viem";
import { CreateInvoiceResponse } from "../schemas/invoice";
import { invoices, merchants } from "../../src/db/schema";
import { desc, eq } from "drizzle-orm";

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
const INVOICE_TTL = 60 * 1000 * 60;

const createMerchant = async (
  app: Hono,
  { adminToken }: AppDeps,
  overrides?: Partial<CreateMerchantBody>,
) => {
  const res = await post(
    app,
    "/api/merchants",
    {
      ...validMerchantBody(overrides),
    },
    adminToken,
  );

  return CreateMerchantResponse.parse(await res.json());
};

const createInvoice = async (
  app: Hono,
  apiKey: string,
  deps: AppDeps,
  overrides?: Partial<CreateInvoiceBody>,
) => {
  const res = await post(
    app,
    "/api/invoices",
    {
      ...validInvoice(deps, overrides),
    },
    apiKey,
  );

  return CreateInvoiceResponse.parse(await res.json());
};

describe("POST /invoices", () => {
  test("409 for duplicate merchantOrderId", async () => {
    const deps = createDeps({ allowInsecureWebhooks: true });
    const app = createApp(deps);

    const merchantOrderId = crypto.randomUUID();

    const { apiKey, merchantId } = await createMerchant(app, deps);

    const first = await post(
      app,
      "/api/invoices",
      { ...validInvoice(deps, { merchantOrderId }) },
      apiKey,
    );
    expect(first.status).toBe(201);

    const second = await post(
      app,
      "/api/invoices",
      {
        ...validInvoice(deps, { merchantOrderId }),
      },
      apiKey,
    );
    expect(second.status).toBe(409);

    const { error } = HttpErrorResponseSchema.parse(await second.json());
    expect(error.code).toBe("merchant_order_registered");
    expect(error.message).toMatch(/already registered/);

    const [m] = await deps.db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId));
    expect(m?.nextDerivationIndex).toBe(1);

    await createInvoice(app, apiKey, deps);
    const [lastInvoice] = await deps.db
      .select()
      .from(invoices)
      .where(eq(invoices.merchantId, merchantId))
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    expect(lastInvoice?.derivationIndex).toBe(1);
  });

  test("201 happy path, strict schema match", async () => {
    const deps = createDeps({ allowInsecureWebhooks: true });
    const app = createApp(deps);

    const merchantOrderId = crypto.randomUUID();
    const amount = "1000000";

    const { merchantId, apiKey } = await createMerchant(app, deps);
    const invoice = await createInvoice(app, apiKey, deps, {
      merchantOrderId,
      amount,
    });

    const [[i], [m]] = await Promise.all([
      deps.db.select().from(invoices).where(eq(invoices.id, invoice.id)),
      deps.db.select().from(merchants).where(eq(merchants.id, merchantId)),
    ]);

    if (!i) throw new Error("invoice not found");
    if (!m) throw new Error("merchant not found");

    expect(i.merchantId).toBe(merchantId);
    expect(i.merchantOrderId).toBe(merchantOrderId);
    expect(i.amount).toBe(amount);
    expect(i.amountReceived).toBe("0");
    expect(i.status).toBe("pending");
    expect(i.paidAt).toBeNull();
    expect(i.derivationIndex).toBe(0);
    expect(m.nextDerivationIndex).toBe(1);
    expect(i.metadata).toBeNull();

    const expected = Date.now() + INVOICE_TTL;
    expect(Math.abs(i.expiresAt.getTime() - expected)).toBeLessThanOrEqual(
      3000,
    );
  });

  test("different requests in sequence for one merchant", async () => {
    const deps = createDeps({ allowInsecureWebhooks: true });
    const app = createApp(deps);

    const { merchantId, apiKey } = await createMerchant(app, deps);

    await createInvoice(app, apiKey, deps);
    await createInvoice(app, apiKey, deps);
    await createInvoice(app, apiKey, deps);

    const [[x, y, z], [m]] = await Promise.all([
      deps.db
        .select()
        .from(invoices)
        .where(eq(invoices.merchantId, merchantId)),
      deps.db.select().from(merchants).where(eq(merchants.id, merchantId)),
    ]);

    if (!m) throw new Error("merchant not found");

    expect(x?.derivationIndex).toBe(0);
    expect(y?.derivationIndex).toBe(1);
    expect(z?.derivationIndex).toBe(2);
    expect(m.nextDerivationIndex).toBe(3);

    expect(x?.address).not.toBe(y?.address);
    expect(x?.address).not.toBe(z?.address);
    expect(y?.address).not.toBe(z?.address);
  });
});

describe("POST /invoices validation", () => {
  const deps = createDeps({ allowInsecureWebhooks: true });

  test.each([
    [
      "invalid merchantOrderId",
      { ...validInvoice(deps, { merchantOrderId: "" }) },
      "merchantOrderId",
    ],
    [
      "merchantOrderId exceeds limit",
      { ...validInvoice(deps, { merchantOrderId: "a".repeat(129) }) },
      "merchantOrderId",
    ],
    ["invalid chainId", { ...validInvoice(deps, { chainId: -1 }) }, "chainId"],
    [
      "invalidTokenAddress",
      { ...validInvoice(deps, { tokenAddress: "0x" }) },
      "tokenAddress",
    ],
    [
      "amount exceeds",
      { ...validInvoice(deps, { amount: (maxUint256 + 1n).toString() }) },
      "amount",
    ],
    [
      "negative amount",
      { ...validInvoice(deps, { amount: (-1n).toString() }) },
      "amount",
    ],
    [
      "fractional amount",
      { ...validInvoice(deps, { amount: (-1.5).toString() }) },
      "amount",
    ],
    [
      "metadata not an object",
      { ...validInvoice(deps, { metadata: "onewayticket" }) },
      "metadata",
    ],
  ])("POST /invoices -> 400 %s", async (_, body, path) => {
    const app = createApp(deps);

    const { apiKey } = await createMerchant(app, deps);

    const res = await post(app, "/api/invoices", body, apiKey);
    expect(res.status).toBe(400);

    const { error } = HttpErrorResponseSchema.parse(await res.json());
    expect(error.code).toBe("validation_error");
    expect(error.message).toBe("invalid json");
    expect(error.issues).toContainEqual(expect.objectContaining({ path }));
  });
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
