export const API_KEY_PREFIX = "sk_live_";
export const API_KEY_PREFIX_BYTES = 8;
export const API_KEY_SECRET_BYTES = 32;
export const API_KEY_RE = new RegExp(
  `^${API_KEY_PREFIX}([0-9a-f]{${API_KEY_PREFIX_BYTES * 2}})_([0-9a-f]{${API_KEY_SECRET_BYTES * 2}})$`,
);

export const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

export const hashApiKey = async (key: string): Promise<string> => {
  return toHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
    ),
  );
};

export const generateApiKey = async () => {
  const prefix = crypto.getRandomValues(new Uint8Array(API_KEY_PREFIX_BYTES));
  const secret = crypto.getRandomValues(new Uint8Array(API_KEY_SECRET_BYTES));

  const key = `${API_KEY_PREFIX}${toHex(prefix)}_${toHex(secret)}`;
  const hash = await hashApiKey(key);

  return {
    key,
    hash,
    prefix: toHex(prefix),
  };
};

export const parseApiKey = (raw: string) => {
  const m = raw.match(API_KEY_RE);
  if (!m) return null;

  const [, prefix, secret] = m;
  if (!prefix || !secret) return null;

  return { prefix, secret };
};

export const verifyApiKey = async (raw: string, hash: string) => {
  const a = Buffer.from(await hashApiKey(raw), "hex");
  const b = Buffer.from(hash, "hex");

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
};
