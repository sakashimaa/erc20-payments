import { BaseError, parseAbiItem, type Log } from "viem";
import { logger } from "../lib/logger";
import { db, queryClient, type DB } from "../db";
import { env, parseRpcUrls } from "../config/watcher-env";
import {
  getPendingInvoicesOnChain,
  obtainStartBlock,
  preflight,
  setCursor,
} from "./utils";
import { createChainRuntimes, type ChainRuntime } from "./config";
import { invoices } from "../db/schema";
import { and, eq } from "drizzle-orm";

export type WatcherDeps = {
  db: DB;
  supportedChainIds: ReadonlySet<number>;
  runtimes: ReadonlyMap<number, ChainRuntime>;
};

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const run = async (signal: AbortSignal) => {
  const rpcByChainId = parseRpcUrls(process.env);
  const runtimes = createChainRuntimes(rpcByChainId);

  const deps: WatcherDeps = {
    db,
    supportedChainIds: env.SUPPORTED_CHAIN_IDS,
    runtimes,
  };

  await preflight(deps);

  while (!signal.aborted) {
    for (const [chainId, { config, client }] of runtimes) {
      const pendingInvoices = await getPendingInvoicesOnChain(deps, chainId);
      if (!pendingInvoices) {
        await setCursor(deps, {
          chainId,
          lastProcessedBlock: await client.getBlockNumber(),
        });
        continue;
      }

      const tokenAddresses = new Set(
        pendingInvoices.map((i) => i.tokenAddress as `0x${string}`),
      );
      const invoiceAddresses = new Set(
        pendingInvoices.map((i) => i.address as `0x${string}`),
      );
      const cursorBlock = await obtainStartBlock(deps, { chainId, client });
      const latestBlock = await client.getBlockNumber();

      const logs = await client.getLogs({
        address: Array.from(tokenAddresses),
        event: transferEvent,
        args: {
          to: Array.from(invoiceAddresses),
        },
        fromBlock: cursorBlock,
        toBlock: latestBlock,
      });

      await setCursor(deps, { lastProcessedBlock: latestBlock, chainId });

      const mappedLogs = new Map<string, Log>();
      logs.forEach((l) =>
        mappedLogs.set(
          `${l.address.toLowerCase()}:${l.args.to?.toLowerCase()}`,
          l,
        ),
      );

      for (const { tokenAddress, address } of pendingInvoices) {
        const log = mappedLogs.get(`${tokenAddress}:${address}`);
        if (!log) continue;

        await db.transaction(async (tx) => {
          await tx
            .update(invoices)
            .set({ status: "detected" })
            .where(
              and(
                eq(invoices.tokenAddress, tokenAddress),
                eq(invoices.address, address),
              ),
            );

          if (log.blockNumber + config.confirmations <= latestBlock) {
            /* блок в канонической цепи, можно смотреть сумму и обновлять статус (underpaid|paid) */
          }
        });
      }
    }
  }
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
    logger.fatal(
      { reason: e instanceof BaseError ? e.shortMessage : String(e) },
      "watcher failed",
    );
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
