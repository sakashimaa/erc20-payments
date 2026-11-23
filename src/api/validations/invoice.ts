import { isAddress, maxUint256 } from "viem";
import z from "zod";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MAX_METADATA_BYTES = 4 * 1024; /* 4 KB */

const metadataSchema = z
  .record(z.string(), z.json())
  .refine(
    (v) => Buffer.byteLength(JSON.stringify(v), "utf8") <= MAX_METADATA_BYTES,
    { message: `metadata exceeds ${MAX_METADATA_BYTES} bytes` },
  )
  .optional();

export const createInvoiceSchema = ({
  supportedChainIds,
}: {
  supportedChainIds: ReadonlySet<number>;
}) =>
  z.object({
    merchantOrderId: z.string().trim().min(1).max(128),
    chainId: z
      .number()
      .int()
      .refine((id) => supportedChainIds.has(id), {
        message: "unsupported chain",
      }),
    tokenAddress: z
      .string()
      .refine((v) => isAddress(v) && v.toLowerCase() !== ZERO_ADDRESS, {
        message: "invalid token address",
      })
      .transform((v) => v.toLowerCase()),
    amount: z
      .string()
      .regex(/^[1-9]\d{0,77}$/, {
        message: "amount must be a positive integer string",
      })
      .transform((v) => BigInt(v))
      .refine((v) => v <= maxUint256, { message: "amount exceeds uint256" }),
    metadata: metadataSchema,
  });
