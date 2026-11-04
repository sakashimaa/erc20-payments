import { describe, expect, test } from "bun:test";
import { generateApiKey, parseApiKey, verifyApiKey } from "./api-keys";

const flipLast = (s: string) => s.slice(0, -1) + (s.endsWith("0") ? "1" : "0");

const extractSecret = (raw: string) => parseApiKey(raw)!.secret;

const { key, prefix, hash } = await generateApiKey();
const secret = extractSecret(key);

describe("api keys utils", () => {
  test("round-trip valid api key", async () => {
    const result = parseApiKey(key);

    expect(result).not.toBeNull();
    expect(result?.prefix).toBe(prefix);
    expect(result?.secret).toBe(secret);

    expect(await verifyApiKey(key, hash)).toBeTrue();
  });

  test("valid but inverted passes parsing but fails on verify", async () => {
    expect(parseApiKey(key)).not.toBeNull();
    expect(await verifyApiKey(flipLast(key), hash)).toBeFalse();
  });

  test("other hash fails", async () => {
    const result = await generateApiKey();

    expect(await verifyApiKey(key, result.hash)).toBeFalse();
    expect(
      await verifyApiKey(result.key.slice(0, -1), result.hash),
    ).toBeFalse();
  });

  test("corrupted hash fails", async () => {
    expect(await verifyApiKey(key, "")).toBeFalse();
    expect(await verifyApiKey(key, "zz")).toBeFalse();
    expect(await verifyApiKey(key, hash.slice(0, -1))).toBeFalse();
  });

  test("generateApiKey gives different data each call", async () => {
    const other = await generateApiKey();

    expect(other.key).not.toEqual(key);
    expect(other.hash).not.toEqual(hash);
    expect(other.prefix).not.toEqual(prefix);
  });

  test("generateApiKey hash dont contain secret", () => {
    expect(hash.includes(secret)).toBe(false);
  });

  test.each([
    ["empty string", ""],
    ["missing sk_ marker char", key.slice(1)],
    ["secret one char short", key.slice(0, -1)],
    ["test mode marker", `sk_test_${prefix}_${secret}`],
    ["uppercase prefix", `sk_live_${prefix.toUpperCase()}_${secret}`],
    ["trailing newline", `${key}\n`],
    ["trailing space", `${key} `],
    ["extra segment", `${key}_aa`],
    ["missing secret segment", `sk_live_${prefix}`],
    ["prefix one char short", `sk_live_${prefix.slice(1)}_${secret}`],
    ["prefix one char long", `sk_live_${prefix}a_${secret}`],
    ["non-hex char in secret", `sk_live_${prefix}_${secret.slice(0, -1)}g`],
  ])("parseApiKey rejects %s", (_, input) => {
    expect(parseApiKey(input)).toBeNull();
  });
});
