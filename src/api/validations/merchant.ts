import z from "zod";
import { isAddress } from "viem";

export const createMerchantSchema = ({
  allowInsecureWebhooks,
}: {
  allowInsecureWebhooks: boolean;
}) =>
  z.object({
    name: z.string().min(1).max(100).trim(),
    webhookUrl: z.url().refine(
      (s) => {
        const { protocol } = new URL(s);
        return (
          protocol === "https:" ||
          (protocol === "http:" && allowInsecureWebhooks)
        );
      },
      { message: "webhookUrl must use https" },
    ),
    xpub: z.string().min(1).max(120),
    firstAddress: z
      .string()
      .min(1)
      .refine((s) => isAddress(s), { message: "invalid address" }),
  });

export const rotateMerchantParamSchema = z.object({
  merchantId: z.uuid(),
});
