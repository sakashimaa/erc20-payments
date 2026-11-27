import { BaseError } from "viem";
import { logger } from "../lib/logger";
import { db, queryClient } from "../db";
import { env, parseRpcUrls } from "../config/watcher-env";
import { preflight, sleep } from "./utils";
import { createChainRuntimes, type ChainRuntime } from "./config";
import { tickChain, type WatcherDeps } from "./processor";

const runChainLoop = async (
  chainId: number,
  runtime: ChainRuntime,
  deps: WatcherDeps,
  signal: AbortSignal,
) => {
  while (!signal.aborted) {
    try {
      await tickChain(chainId, runtime, deps, signal);
    } catch (e) {
      logger.error(
        {
          chainId,
          reason: e instanceof BaseError ? e.shortMessage : String(e),
        },
        "chain poll tick failed",
      );
    }

    await sleep(runtime.config.pollIntervalMs, signal);
  }
};

const run = async (signal: AbortSignal) => {
  const rpcByChainId = parseRpcUrls(process.env);
  const runtimes = createChainRuntimes(rpcByChainId);

  const deps: WatcherDeps = {
    db,
    supportedChainIds: env.SUPPORTED_CHAIN_IDS,
    runtimes,
  };

  await preflight(deps);

  await Promise.all(
    Array.from(runtimes.entries()).map(([chainId, runtime]) =>
      runChainLoop(chainId, runtime, deps, signal),
    ),
  );
};

const ac = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    ac.abort();
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

run(ac.signal)
  .catch((e) => {
    logger.fatal({ e }, "watcher failed");
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
