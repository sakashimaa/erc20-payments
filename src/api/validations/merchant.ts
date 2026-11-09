import z from "zod";
import { isAddress } from "viem";

export const createMerchantSchema = ({
  allowInsecureWebhooks,
}: {
  allowInsecureWebhooks: boolean;
}) =>
  z.object({
    name: z.string().min(1).max(100).trim(),
    webhookUrl: z.url({
      protocol: allowInsecureWebhooks ? /^https?$/ : /^https$/,
      error: allowInsecureWebhooks
        ? "webhookUrl must be http(s) url"
        : "webhookUrl must be https url",
    }),
    xpub: z.string().min(1).max(120),
    firstAddress: z
      .string()
      .min(1)
      .refine((s) => isAddress(s), { message: "invalid address" }),
  });

export const rotateMerchantParamSchema = z.object({
  merchantId: z.uuid(),
});
