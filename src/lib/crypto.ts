export const IV_BYTES = 12;
export const TAG_BYTES = 16;

type EncryptionPurpose = "xpub" | "webhook_secret";

export class DecryptionError extends Error {
  override name = "DecryptionError";

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

export const importDataKey = async (base64: string) => {
  const decoded = Buffer.from(base64, "base64");

  if (decoded.byteLength !== 32)
    throw new Error(
      `encryption key byte length should be 32, got ${decoded.byteLength}`,
    );

  return crypto.subtle.importKey("raw", decoded, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
};

export const aadFor = (merchantId: string, purpose: EncryptionPurpose) =>
  new TextEncoder().encode(`${merchantId}:${purpose}`);

export const createCipher = (key: CryptoKey) => ({
  encrypt: async (plaintext: string, aad: Uint8Array<ArrayBuffer>) => {
    const bytes = new TextEncoder().encode(plaintext);

    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        key,
        bytes,
      ),
    );

    return Buffer.concat([iv, ct]);
  },
  decrypt: async (data: Uint8Array, aad: Uint8Array<ArrayBuffer>) => {
    const minBytes = IV_BYTES + TAG_BYTES;
    if (data.byteLength < minBytes)
      throw new Error(`byte length should be at least ${minBytes}`);

    const bytes = new Uint8Array(data);
    const iv = bytes.subarray(0, IV_BYTES);
    const ct = bytes.subarray(IV_BYTES);

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        key,
        ct,
      );

      return new TextDecoder().decode(decrypted);
    } catch (err) {
      throw new DecryptionError(
        "decryption failed: wrong key, AAD or corrupted data",
        { cause: err },
      );
    }
  },
});
