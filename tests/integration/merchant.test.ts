import { createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, test } from "bun:test";
import { mnemonicToSeedSync } from "@scure/bip39";
import { ANVIL } from "../fixtures/wallets";
import { HDKey } from "viem/accounts";
import { createApp } from "../../src/api/app";
import { createDeps, TEST_ADMIN_TOKEN } from "../helpers/deps";
import { post } from "../helpers/api";

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
const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0");

const xpub = node.publicExtendedKey;

let res;

describe("POST /merchants", () => {
  test("inverted parent still gives same fingerprint and rejects with 409", async () => {
    const app = createApp(createDeps({ allowInsecureWebhooks: true }));

    res = await post(
      app,
      "/api/merchants",
      {
        name: "yokoshima",
        webhookUrl,
        xpub,
        firstAddress: ANVIL.addresses[0],
      },
      TEST_ADMIN_TOKEN,
    );

    expect(res.status).toBe(201);

    res = await post(
      app,
      "/api/merchants",
      {
        name: "yokoshimaa",
        webhookUrl,
        xpub: tamperParentFingerprint(xpub),
        firstAddress: ANVIL.addresses[0],
      },
      TEST_ADMIN_TOKEN,
    );

    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json).toMatchObject({
      error: { code: "xpub_already_registered" },
    });
  });
});
