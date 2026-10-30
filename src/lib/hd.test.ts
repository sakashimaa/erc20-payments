import { describe, expect, test } from "bun:test";
import {
  deriveAddress,
  InvalidDerivationIndexError,
  InvalidMnemonicError,
  xpubFromMnemonic,
} from "./hd";
import { ANVIL, MERCHANT } from "../../tests/fixtures/wallets";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "viem/accounts";

describe("hd derivation", () => {
  const xpub = xpubFromMnemonic(ANVIL.mnemonic);
  const merchantXpub = xpubFromMnemonic(MERCHANT.mnemonic);

  const seed = mnemonicToSeedSync(ANVIL.mnemonic);
  const accountLevelXpub =
    HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'").publicExtendedKey;

  test("matches anvil accounts", () => {
    expect(deriveAddress(xpub, 0)).toBe(ANVIL.addresses[0]);
    expect(deriveAddress(xpub, 1)).toBe(ANVIL.addresses[1]);
  });

  test("matches merchant accounts", () => {
    expect(deriveAddress(merchantXpub, 0)).toBe(MERCHANT.addresses[0]);
    expect(deriveAddress(merchantXpub, 1)).toBe(MERCHANT.addresses[1]);
  });

  test("xpub from wrong level gives different addresses", () => {
    expect(deriveAddress(accountLevelXpub, 0)).not.toBe(ANVIL.addresses[0]);
  });

  test("invalid indexes throws error", () => {
    expect(() => deriveAddress(xpub, -1)).toThrow(InvalidDerivationIndexError);
    expect(() => deriveAddress(xpub, 2 ** 31)).toThrow(
      InvalidDerivationIndexError,
    );
    expect(() => deriveAddress(xpub, 1.5)).toThrow(InvalidDerivationIndexError);
    expect(() => deriveAddress(xpub, NaN)).toThrow(InvalidDerivationIndexError);
  });

  test("upper limit derive index comes through validation", () => {
    expect(() => deriveAddress(xpub, 2 ** 31 - 1)).not.toThrow();
  });

  test("invalid mnemonic throws", () => {
    const words = ANVIL.mnemonic.split(" ");

    const elevenWords = [...words.slice(0, 11)].join(" ");
    expect(() => xpubFromMnemonic(elevenWords)).toThrow(InvalidMnemonicError);

    const badChecksum = [...words.slice(0, 11), "abandon"].join(" ");
    expect(() => xpubFromMnemonic(badChecksum)).toThrow(InvalidMnemonicError);
  });
});
