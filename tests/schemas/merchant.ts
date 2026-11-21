import { z } from "zod";
import { API_KEY_RE } from "../../src/lib/api-keys";
import { WEBHOOK_SECRET_RE } from "../../src/lib/webhook-secret";

const apiKeySchema = z.string().regex(API_KEY_RE, "invalid apiKey format");
const webhookSecretSchema = z
  .string()
  .regex(WEBHOOK_SECRET_RE, "invalid webhookSecret format");

export const CreateMerchantResponse = z
  .object({
    merchantId: z.uuid(),
    apiKey: apiKeySchema,
    webhookSecret: webhookSecretSchema,
  })
  .strict();

export const RotateMerchantResponse = z
  .object({
    apiKey: apiKeySchema,
    webhookSecret: webhookSecretSchema,
  })
  .strict();
