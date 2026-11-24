import z from "zod";
import { chainIdsSchema } from "../schemas/chain";
import { baseEnvSchema, loadEnv } from "./base-env";

const urlSchema = z.url();

export const parseRpcUrls = (
  rawEnv: NodeJS.ProcessEnv,
): ReadonlyMap<number, string> => {
  const map = new Map<number, string>();

  for (const [k, v] of Object.entries(rawEnv)) {
    if (!k.startsWith("RPC_URL_") || !v) continue;

    const chainId = Number(k.slice("RPC_URL_".length));
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new Error(`invalid chainId in env key: ${k}`);
    }

    map.set(chainId, urlSchema.parse(v));
  }

  return map;
};

export const env = loadEnv(
  baseEnvSchema.extend({
    SUPPORTED_CHAIN_IDS: chainIdsSchema,
  }),
  "worker-env validation error",
);
