import { isAddress } from "viem";
import z from "zod";

export const CreateInvoiceResponse = z
  .object({
    id: z.uuid(),
    address: z
      .string()
      .min(1)
      .refine((v) => isAddress(v), { message: "invalid address" }),
    expiresAt: z.string().min(1),
  })
  .strict();
