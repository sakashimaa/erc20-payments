import z from "zod";
import { baseEnvSchema, loadEnv, withDatabaseUrl } from "./base-env";

export const env = loadEnv(
  baseEnvSchema
    .extend({
      HTTP_PORT: z.coerce.number().positive().default(3000),
    })
    .transform(withDatabaseUrl),
  "api-env validation error",
);
