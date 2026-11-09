import { toHex } from "./api-keys";

export const WEBHOOK_SECRET_BYTES = 32;
export const WEBHOOK_SECRET_PREFIX = "whsec_";

export const generateWebhookSecret = () => {
  const secret = toHex(
    crypto.getRandomValues(new Uint8Array(WEBHOOK_SECRET_BYTES)),
  );

  return `${WEBHOOK_SECRET_PREFIX}${secret}`;
};
