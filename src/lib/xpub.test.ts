import { mnemonicToSeedSync } from "@scure/bip39";
import { describe, expect, test } from "bun:test";
import { ANVIL, MERCHANT } from "../../tests/fixtures/wallets";
import { HDKey } from "viem/accounts";
import { validateMerchantXpub, XpubValidationError } from "./xpub";
import { checksumAddress } from "viem";

const seed = mnemonicToSeedSync(ANVIL.mnemonic);
const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0");

const validXpub = node.publicExtendedKey;
const xprv = node.privateExtendedKey;
const accountXpub =
  HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'").publicExtendedKey;

const reasonOf = (fn: () => void) => errorOf(fn).reason;

const errorOf = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof XpubValidationError) return e;
    throw e;
  }

  throw new Error("expected XpubValidationError, got nothing");
};

const leaks = (err: Error, secret: string) =>
  [
    err.message,
    err.stack,
    String(err.cause),
    ((err.cause as Error) || undefined)?.stack,
  ].some((s) => s?.includes(secret));

describe("xpub validation", () => {
  test("valid xpub passes", () => {
    expect(() =>
      validateMerchantXpub(validXpub, ANVIL.addresses[0]),
    ).not.toThrow();
  });

  test("junk xpub format fails", () => {
    expect(
      reasonOf(() =>
        validateMerchantXpub("deadmanwalking", ANVIL.addresses[0]),
      ),
    ).toBe("invalid_format");
  });

  test("wrong depth xpub fails", () => {
    expect(
      reasonOf(() => validateMerchantXpub(accountXpub, ANVIL.addresses[0])),
    ).toBe("wrong_depth");
  });

  test("rejects xprv without leaking it", () => {
    const err = errorOf(() => validateMerchantXpub(xprv, ANVIL.addresses[0]));

    expect(err.reason).toBe("private_key");
    expect(leaks(err, xprv)).toBe(false);
  });

  test("malformed xprv dont leak via cause", () => {
    const broken = xprv.slice(0, -1) + (xprv.endsWith("a") ? "b" : "a");
    const err = errorOf(() => validateMerchantXpub(broken, ANVIL.addresses[0]));

    expect(err.reason).toBe("invalid_format");
    expect(leaks(err, broken)).toBe(false);
  });

  test("valid xpub firstAddress mismatch", () => {
    expect(
      reasonOf(() => validateMerchantXpub(validXpub, ANVIL.addresses[1])),
    ).toBe("address_mismatch");
  });

  test("other wallet address mismatch", () => {
    const merchantXpub = HDKey.fromMasterSeed(
      mnemonicToSeedSync(MERCHANT.mnemonic),
    ).derive("m/44'/60'/0'/0").publicExtendedKey;

    expect(
      reasonOf(() => validateMerchantXpub(merchantXpub, ANVIL.addresses[0])),
    ).toBe("address_mismatch");
  });

  test("lowercasing address", () => {
    expect(() =>
      validateMerchantXpub(validXpub, checksumAddress(ANVIL.addresses[0])),
    ).not.toThrow();
  });
});
