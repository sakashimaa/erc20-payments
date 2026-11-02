import { describe, expect, test } from "bun:test";
import {
  aadFor,
  createCipher,
  DecryptionError,
  importDataKey,
  IV_BYTES,
  TAG_BYTES,
} from "./crypto";
import { xpubFromMnemonic } from "./hd";
import { ANVIL } from "../../tests/fixtures/wallets";

const keyB64 = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
  "base64",
);

const { encrypt, decrypt } = createCipher(await importDataKey(keyB64));

describe("crypto functions", () => {
  test("encrypt/decrypt roundtrip", async () => {
    const data = "deadmanwalking";
    const aad = aadFor(crypto.randomUUID(), "webhook_secret");

    const encrypted = await encrypt(data, aad);

    expect(await decrypt(encrypted, aad)).toBe(data);
  });

  test("invalid key length fails", () => {
    const invalidKeyLess = Buffer.from(
      crypto.getRandomValues(new Uint8Array(31)),
    ).toString("base64");

    const invalidKeyMore = Buffer.from(
      crypto.getRandomValues(new Uint8Array(33)),
    ).toString("base64");

    const errRegex = /encryption key byte length should be 32/;

    expect(importDataKey(invalidKeyLess)).rejects.toThrow(errRegex);
    expect(importDataKey(invalidKeyMore)).rejects.toThrow(errRegex);
  });

  test("invalid decryption aad purpose", async () => {
    const data = "deadmanwalking";
    const uuid = crypto.randomUUID();

    const encrypted = await encrypt(data, aadFor(uuid, "webhook_secret"));

    expect(decrypt(encrypted, aadFor(uuid, "xpub"))).rejects.toThrow(
      DecryptionError,
    );
  });

  test("invalid decryption aad merchantId", async () => {
    const data = "deadmanwalking";

    const encrypted = await encrypt(
      data,
      aadFor(crypto.randomUUID(), "webhook_secret"),
    );

    expect(
      decrypt(encrypted, aadFor(crypto.randomUUID(), "webhook_secret")),
    ).rejects.toThrow(DecryptionError);
  });

  test.each([
    ["iv", 0],
    ["ciphertext", IV_BYTES],
    ["tag", -1],
  ])("rejects tampered %s", async (_, pos) => {
    const aad = aadFor(crypto.randomUUID(), "xpub");
    const blob = Buffer.from(await encrypt("deadmanwalking", aad));

    const i = pos < 0 ? blob.length + pos : pos;
    blob[i]! ^= 1;

    expect(decrypt(blob, aad)).rejects.toThrow(DecryptionError);
  });

  test("different keys cannot decrypt each other data", async () => {
    const aad = aadFor(crypto.randomUUID(), "xpub");
    const encrypted = await encrypt("deadmanwalking", aad);

    const otherKey = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64");

    const { decrypt: decryptOther } = createCipher(
      await importDataKey(otherKey),
    );

    expect(decryptOther(encrypted, aad)).rejects.toThrow(DecryptionError);
  });

  test("random iv", async () => {
    const aad = aadFor(crypto.randomUUID(), "xpub");

    const data = "deadmanwalking";
    const a = await encrypt(data, aad);
    const b = await encrypt(data, aad);

    expect(a.equals(b)).toBe(false);
    expect(await decrypt(a, aad)).toBe(data);
    expect(await decrypt(b, aad)).toBe(data);
  });

  test("decrypt fails on junk data", () => {
    expect(
      decrypt(Buffer.alloc(27), aadFor(crypto.randomUUID(), "xpub")),
    ).rejects.toThrow(/at least/);
  });

  test("empty data in encrypt", async () => {
    const aad = aadFor(crypto.randomUUID(), "xpub");

    const encrypted = await encrypt("", aad);
    expect(encrypted.length).toBe(IV_BYTES + TAG_BYTES);
    expect(await decrypt(encrypted, aad)).toBe("");
  });

  test("non ascii text roundtrip", async () => {
    const aad = aadFor(crypto.randomUUID(), "xpub");

    const data = "лиловыеглаза 🔐";
    expect(await decrypt(await encrypt(data, aad), aad)).toBe(data);
  });

  test("roundtrip real xpub", async () => {
    const xpub = xpubFromMnemonic(ANVIL.mnemonic);
    const aad = aadFor(crypto.randomUUID(), "xpub");

    expect(await decrypt(await encrypt(xpub, aad), aad)).toBe(xpub);
  });
});
