import { secp256k1 } from "@noble/curves/secp256k1.js";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { toHex } from "viem";
import { english, HDKey, publicKeyToAddress } from "viem/accounts";

export class InvalidDerivationIndexError extends Error {
  constructor(message: string = "derivation index is invalid") {
    super(message);
    this.name = "InvalidDerivationIndexError";
  }
}

export class InvalidMnemonicError extends Error {
  constructor(message: string = "invalid mnemonic") {
    super(message);
    this.name = "InvalidMnemonicError";
  }
}

export const xpubFromMnemonic = (mnemonic: string) => {
  if (!validateMnemonic(mnemonic, english)) throw new InvalidMnemonicError();

  const seed = mnemonicToSeedSync(mnemonic);

  return HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0").publicExtendedKey;
};

export const deriveAddress = (xpub: string, index: number) => {
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31)
    throw new InvalidDerivationIndexError();

  const publicKeyCompressed =
    HDKey.fromExtendedKey(xpub).deriveChild(index).publicKey;
  if (!publicKeyCompressed) throw new Error("failed to derive address");

  const publicKey =
    secp256k1.Point.fromBytes(publicKeyCompressed).toBytes(false);

  return publicKeyToAddress(toHex(publicKey)).toLowerCase();
};
