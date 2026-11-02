import { HDKey } from "viem/accounts";
import { deriveAddress } from "./hd";

type XpubErrorReason =
  "invalid_format" | "private_key" | "wrong_depth" | "address_mismatch";

export class XpubValidationError extends Error {
  override name = "XpubValidationError";

  constructor(
    message: string,
    public readonly reason: XpubErrorReason,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export const validateMerchantXpub = (
  xpub: string,
  firstAddress: string,
): void => {
  let hd: HDKey;
  try {
    hd = HDKey.fromExtendedKey(xpub);
  } catch (err) {
    throw new XpubValidationError("invalid extended key", "invalid_format", {
      cause: err,
    });
  }

  if (hd.privateKey !== null)
    throw new XpubValidationError(
      "expected xpub, got private key",
      "private_key",
    );

  if (hd.depth !== 4)
    throw new XpubValidationError(
      `wrong xpub depth, expected 4, got ${hd.depth}`,
      "wrong_depth",
    );

  if (deriveAddress(xpub, 0) !== firstAddress.toLowerCase())
    throw new XpubValidationError("first address mismatch", "address_mismatch");
};
