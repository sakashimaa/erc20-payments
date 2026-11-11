import { createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { beforeEach, describe, expect, test } from "bun:test";
import { mnemonicToSeedSync } from "@scure/bip39";
import { ANVIL } from "../fixtures/wallets";
import { HDKey } from "viem/accounts";
import { createApp } from "../../src/api/app";
import { createDeps, TEST_ADMIN_TOKEN } from "../helpers/deps";
import { matchObjectJson, post } from "../helpers/api";
import { truncateAll } from "../helpers/db";
import z from "zod";
import { API_KEY_RE, verifyApiKey } from "../../src/lib/api-keys";
import { WEBHOOK_SECRET_RE } from "../../src/lib/webhook-secret";
import { apiKeys, merchants } from "../../src/db/schema";
import { and, eq, isNull, not } from "drizzle-orm";
import { aadFor } from "../../src/lib/crypto";

const b58 = createBase58check(sha256);
const XPUB_BYTES = 78;
const webhookUrl = "http://localhost:3001/api/webhooks/erc20-payments";

const tamperParentFingerprint = (xpub: string) => {
  const bytes = b58.decode(xpub);
  if (bytes.length !== XPUB_BYTES)
    throw new Error(`expected ${XPUB_BYTES} bytes, got ${bytes.length}`);

  bytes[5] = bytes[5]! ^ 0xff;
  return b58.encode(bytes);
};

const seed = mnemonicToSeedSync(ANVIL.mnemonic);
const root = HDKey.fromMasterSeed(seed);
const node = root.derive("m/44'/60'/0'/0");

const xpub = node.publicExtendedKey;

const valid = {
  name: "yokoshima",
  webhookUrl,
  xpub,
  firstAddress: ANVIL.addresses[0],
};

const apiKeySchema = z.string().regex(API_KEY_RE, "invalid apiKey format");
const webhookSecretSchema = z
  .string()
  .regex(WEBHOOK_SECRET_RE, "invalid webhookSecret format");

const CreateMerchantResponse = z
  .object({
    merchantId: z.uuid(),
    apiKey: apiKeySchema,
    webhookSecret: webhookSecretSchema,
  })
  .strict();

const RotateMerchantResponse = z
  .object({
    apiKey: apiKeySchema,
    webhookSecret: webhookSecretSchema,
  })
  .strict();

beforeEach(async () => {
  await truncateAll();
});

describe("POST /merchants validation", () => {
  const app = createApp(createDeps({ allowInsecureWebhooks: true }));

  test.each([
    ["empty name", { ...valid, name: "" }, "name"],
    ["missing name", { ...valid, name: undefined }, "name"],
    ["bad webhookUrl", { ...valid, webhookUrl: "not-a-url" }, "webhookUrl"],
    ["bad firstAddress", { ...valid, firstAddress: "0x123" }, "firstAddress"],
    ["spaced name", { ...valid, name: "   " }, "name"],
  ])("POST /merchants %s -> 400", async (_, body, field) => {
    const res = await post(
      app,
      "/api/merchants",
      { ...body },
      TEST_ADMIN_TOKEN,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: "validation_error",
        issues: expect.arrayContaining([
          expect.objectContaining({ path: field }),
        ]),
      },
    });
  });
});

describe("POST /merchants xpub errors", () => {
  const app = createApp(createDeps({ allowInsecureWebhooks: true }));

  test.each([
    ["invalid_format", "garbage", ANVIL.addresses[0]],
    ["private_key", node.privateExtendedKey, ANVIL.addresses[0]],
    [
      "wrong_depth",
      root.derive("m/44'/60'/0'").publicExtendedKey,
      ANVIL.addresses[0],
    ],
    ["address_mismatch", xpub, ANVIL.addresses[1]],
  ])("xpub_%s -> 400", async (reason, xpub, firstAddress) => {
    const res = await post(
      app,
      "/api/merchants",
      {
        ...valid,
        xpub,
        firstAddress,
      },
      TEST_ADMIN_TOKEN,
    );

    expect(res.status).toBe(400);
    await matchObjectJson(res, { error: { code: `xpub_${reason}` } });
  });
});

describe("auth on POST /merchants, /:merchantId/rotate", () => {
  test("401 with no auth header", async () => {
    const app = createApp(createDeps({ allowInsecureWebhooks: true }));

    const first = await post(app, "/api/merchants", {});
    expect(first.status).toBe(401);

    await matchObjectJson(first, {
      error: { code: "unauthorized" },
    });

    const second = await post(
      app,
      `/api/merchants/${crypto.randomUUID()}/rotate`,
      {},
    );
    expect(second.status).toBe(401);

    await matchObjectJson(second, {
      error: { code: "unauthorized" },
    });
  });

  test("401 with corrupted header", async () => {
    const app = createApp(createDeps({ allowInsecureWebhooks: true }));

    const first = await post(app, "/api/merchants", {}, "xxx");
    expect(first.status).toBe(401);
    await matchObjectJson(first, {
      error: { code: "unauthorized" },
    });

    const second = await post(
      app,
      `/api/merchants/${crypto.randomUUID()}/rotate`,
      {},
      "xxx",
    );
    expect(second.status).toBe(401);
    await matchObjectJson(second, {
      error: { code: "unauthorized" },
    });
  });

  test("401 with another length token", async () => {
    const app = createApp(createDeps({ allowInsecureWebhooks: true }));

    const first = await post(
      app,
      "/api/merchants",
      {},
      TEST_ADMIN_TOKEN.slice(0, 31),
    );
    expect(first.status).toBe(401);
    await matchObjectJson(first, {
      error: { code: "unauthorized" },
    });

    const second = await post(
      app,
      `/api/merchants/${crypto.randomUUID()}/rotate`,
      {},
      TEST_ADMIN_TOKEN.slice(0, 31),
    );
    expect(second.status).toBe(401);
    await matchObjectJson(second, {
      error: { code: "unauthorized" },
    });
  });
});

describe("POST /:merchantId/rotate", () => {
  test("404 with unexistent merchant", async () => {
    const app = createApp(createDeps({ allowInsecureWebhooks: true }));

    const first = await post(
      app,
      `/api/merchants/${crypto.randomUUID()}/rotate`,
      {},
      TEST_ADMIN_TOKEN,
    );

    expect(first.status).toBe(404);
  });

  test("successful rotation", async () => {
    const deps = createDeps({ allowInsecureWebhooks: true });
    const app = createApp(deps);

    const first = await post(
      app,
      "/api/merchants",
      { ...valid },
      TEST_ADMIN_TOKEN,
    );

    expect(first.status).toBe(201);
    const merchant = CreateMerchantResponse.parse(await first.json());

    const second = await post(
      app,
      `/api/merchants/${merchant.merchantId}/rotate`,
      {},
      TEST_ADMIN_TOKEN,
    );

    const rotated = RotateMerchantResponse.parse(await second.json());

    expect(merchant.apiKey).not.toBe(rotated.apiKey);
    expect(merchant.webhookSecret).not.toBe(rotated.webhookSecret);

    const [[merchantDb], [validKey], [revokedKey]] = await Promise.all([
      deps.db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchant.merchantId)),
      deps.db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.merchantId, merchant.merchantId),
            isNull(apiKeys.revokedAt),
          ),
        ),
      deps.db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.merchantId, merchant.merchantId),
            not(isNull(apiKeys.revokedAt)),
          ),
        ),
    ]);

    expect(merchantDb).not.toBeNull();
    expect(validKey).not.toBeNull();

    expect(
      await deps.cipher.decrypt(
        merchantDb!.webhookSecretEnc,
        aadFor(merchant.merchantId, "webhook_secret"),
      ),
    ).toBe(rotated.webhookSecret);
    expect(await verifyApiKey(rotated.apiKey, validKey!.keyHash)).toBe(true);
    expect(await verifyApiKey(merchant.apiKey, revokedKey!.keyHash)).toBe(true);
  });
});

describe("POST /merchants", () => {
  test("successful creation", async () => {
    const app = createApp(createDeps({ allowInsecureWebhooks: true }));

    const first = await post(
      app,
      "/api/merchants",
      { ...valid },
      TEST_ADMIN_TOKEN,
    );

    expect(first.status).toBe(201);
    expect(first.headers.get("cache-control")).toBe("no-store");

    CreateMerchantResponse.parse(await first.json());
  });

  test("inverted parent still gives same fingerprint and rejects with 409", async () => {
    const app = createApp(createDeps({ allowInsecureWebhooks: true }));

    const first = await post(
      app,
      "/api/merchants",
      { ...valid },
      TEST_ADMIN_TOKEN,
    );

    expect(first.status).toBe(201);

    const tampered = tamperParentFingerprint(xpub);
    expect(tampered).not.toBe(xpub);
    expect(HDKey.fromExtendedKey(tampered).publicKey).toEqual(node.publicKey);

    const second = await post(
      app,
      "/api/merchants",
      {
        ...valid,
        xpub: tamperParentFingerprint(xpub),
      },
      TEST_ADMIN_TOKEN,
    );

    expect(second.status).toBe(409);

    const json = await second.json();
    expect(json).toMatchObject({
      error: { code: "xpub_already_registered" },
    });
  });
});
