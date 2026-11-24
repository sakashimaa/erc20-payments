import z from "zod";
import { baseEnvSchema, loadEnv, withDatabaseUrl } from "./base-env";
import { chainIdsSchema } from "../schemas/chain";

export const env = loadEnv(
  baseEnvSchema
    .extend({
      HTTP_PORT: z.coerce.number().positive().default(3000),
      SUPPORTED_CHAIN_IDS: chainIdsSchema,
    })
    .transform(withDatabaseUrl),
  "api-env validation error",
);
