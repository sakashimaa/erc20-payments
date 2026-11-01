export const IV_BYTES = 12;
export const TAG_BYTES = 16;

type EncryptionPurpose = "xpub" | "webhook_secret";

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
      throw new Error(
        `expected ${minBytes} AES-GCM or more, got ${data.byteLength}`,
      );

    const bytes = new Uint8Array(data);
    const iv = bytes.subarray(0, IV_BYTES);
    const ct = bytes.subarray(IV_BYTES);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      ct,
    );

    return new TextDecoder().decode(decrypted);
  },
});
