import { BaseError, parseAbiItem } from "viem";
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
import { invoices, type Invoice } from "../db/schema";
import { and, eq } from "drizzle-orm";

export type WatcherDeps = {
  db: DB;
  supportedChainIds: ReadonlySet<number>;
  runtimes: ReadonlyMap<number, ChainRuntime>;
};

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const processChain = async (
  chainId: number,
  { client, config }: ChainRuntime,
  deps: WatcherDeps,
) => {
  const pendingInvoices = await getPendingInvoicesOnChain(deps, chainId);
  if (pendingInvoices.length === 0) {
    await setCursor(
      {
        chainId,
        lastProcessedBlock: await client.getBlockNumber(),
      },
      deps.db,
    );

    return;
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

  const mappedInvoices = new Map<string, Invoice>();
  pendingInvoices.forEach((i) =>
    mappedInvoices.set(`${i.tokenAddress}:${i.address}`, i),
  );

  for (const log of logs) {
    const inv = mappedInvoices.get(`${log.address}:${log.args.to}`);
    if (!inv) continue;

    const tokenAddress = inv.tokenAddress as `0x${string}`;
    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "detected" })
        .where(
          and(
            eq(invoices.tokenAddress, tokenAddress),
            eq(invoices.address, inv.address),
          ),
        );

      await setCursor({ lastProcessedBlock: latestBlock, chainId }, tx);
    });
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

  while (!signal.aborted) {
    await Promise.all(
      [...runtimes].map(async (r) => await processChain(r[0], r[1], deps)),
    );
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
