import z from "zod";
import { baseEnvSchema, loadEnv, withDatabaseUrl } from "./base-env";

const INT4_MAX = 2_147_483_647;

const chainIdsSchema = z
  .string()
  .transform((v) => v.split(",").map((s) => s.trim()))
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^[1-9]\d*$/, {
            message: "chain id must be a positive integer",
          })
          .transform(Number)
          .pipe(z.number().int().max(INT4_MAX)),
      )
      .min(1),
  )
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "duplicate chain ids",
  })
  .transform((ids): ReadonlySet<number> => new Set(ids));

export const env = loadEnv(
  baseEnvSchema
    .extend({
      HTTP_PORT: z.coerce.number().positive().default(3000),
      SUPPORTED_CHAIN_IDS: chainIdsSchema,
    })
    .transform(withDatabaseUrl),
  "api-env validation error",
);
