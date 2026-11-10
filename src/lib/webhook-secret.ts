import { toHex } from "./api-keys";

const HEX = "[0-9a-f]";

export const WEBHOOK_SECRET_BYTES = 32;
export const WEBHOOK_SECRET_PREFIX = "whsec_";
export const WEBHOOK_SECRET_RE = new RegExp(`^whsec_${HEX}{64}$`);

export const generateWebhookSecret = () => {
  const secret = toHex(
    crypto.getRandomValues(new Uint8Array(WEBHOOK_SECRET_BYTES)),
  );

  return `${WEBHOOK_SECRET_PREFIX}${secret}`;
};
