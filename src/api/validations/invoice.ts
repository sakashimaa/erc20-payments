import { isAddress, maxUint256 } from "viem";
import z from "zod";
import { env } from "../../config/api-env";

export const createInvoiceSchema = z.object({
  merchantOrderId: z.string().trim().min(1).max(128),
  chainId: z
    .number()
    .int()
    .refine((id) => env.SUPPORTED_CHAIN_IDS.has(id), {
      message: "unsupported chain",
    }),
  tokenAddress: z
    .string()
    .refine((v) => isAddress(v), { message: "invalid token address" })
    .transform((v) => v.toLowerCase()),
  amount: z
    .string()
    .regex(/^[1-9]\d{0,77}$/, {
      message: "amount must be a positive integer string",
    })
    .transform((v) => BigInt(v))
    .refine((v) => v <= maxUint256, { message: "amount exceeds uint256" }),
  metadata: z.record(z.string(), z.json()).optional(),
});
