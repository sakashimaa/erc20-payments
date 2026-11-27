import { parseAbiItem, type Log } from "viem";
import type { DB } from "../db";
import type { ChainRuntime } from "./config";
import {
  getPendingInvoicesOnChain,
  obtainStartBlock,
  setCursor,
} from "./utils";
import { invoices, transfers, type Invoice } from "../db/schema";
import { and, eq, lte, sql } from "drizzle-orm";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export type WatcherDeps = {
  db: DB;
  supportedChainIds: ReadonlySet<number>;
  runtimes: ReadonlyMap<number, ChainRuntime>;
};

const validateLog = (log: Log) => {
  if (
    log.removed ||
    log.blockNumber === null ||
    !log.blockHash ||
    !log.transactionHash ||
    log.logIndex === null
  ) {
    return false;
  }

  return true;
};

export const tickChain = async (
  chainId: number,
  runtime: ChainRuntime,
  deps: WatcherDeps,
  signal?: AbortSignal,
) => {
  const latestBlock = await runtime.client.getBlockNumber();

  await scanChainLogs(chainId, runtime, latestBlock, deps, signal);
  if (signal?.aborted) return;

  await confirmChainTransfers(chainId, runtime, latestBlock, deps);
};

const confirmChainTransfers = async (
  chainId: number,
  { client, config }: ChainRuntime,
  latestBlock: bigint,
  deps: WatcherDeps,
) => {
  if (latestBlock + 1n < config.confirmations) return;

  const maxConfirmedBlock = latestBlock - config.confirmations + 1n;

  const readyTransfers = await deps.db
    .select()
    .from(transfers)
    .where(
      and(
        eq(transfers.chainId, chainId),
        eq(transfers.status, "seen"),
        lte(transfers.blockNumber, maxConfirmedBlock),
      ),
    );

  if (readyTransfers.length === 0) return;

  const blockHashCache = new Map<bigint, string | null>();

  const getCanonicalBlockHash = async (blockNumber: bigint) => {
    if (blockHashCache.has(blockNumber)) {
      return blockHashCache.get(blockNumber) ?? null;
    }

    const block = await client.getBlock({ blockNumber });

    const hash = block.hash ? block.hash.toLowerCase() : null;
    blockHashCache.set(blockNumber, hash);

    return hash;
  };

  for (const transfer of readyTransfers) {
    const canonicalHash = await getCanonicalBlockHash(transfer.blockNumber);
    const isCanonical =
      canonicalHash !== null &&
      canonicalHash === transfer.blockHash.toLowerCase();

    await deps.db.transaction(async (tx) => {
      if (!isCanonical) {
        await tx
          .update(transfers)
          .set({ status: "orphaned" })
          .where(
            and(eq(transfers.id, transfer.id), eq(transfers.status, "seen")),
          );

        const [remaining] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(transfers)
          .where(
            and(
              eq(transfers.invoiceId, transfer.invoiceId),
              sql`${transfers.status} IN ('seen', 'confirmed')`,
            ),
          );

        if ((remaining?.count ?? 0) === 0) {
          await tx
            .update(invoices)
            .set({ status: "pending" })
            .where(
              and(
                eq(invoices.id, transfer.invoiceId),
                eq(invoices.status, "detected"),
              ),
            );
        }

        return;
      }

      const [confirmed] = await tx
        .update(transfers)
        .set({ status: "confirmed" })
        .where(and(eq(transfers.id, transfer.id), eq(transfers.status, "seen")))
        .returning();
      if (!confirmed) return;

      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, confirmed.invoiceId))
        .for("update");
      if (!inv) return;

      const newReceived = BigInt(inv.amountReceived) + BigInt(confirmed.amount);
      const expected = BigInt(inv.amount);

      const nextStatus =
        newReceived < expected
          ? "underpaid"
          : newReceived === expected
            ? "paid"
            : "overpaid";

      const isFinalPaid = nextStatus === "paid" || nextStatus === "overpaid";

      await tx
        .update(invoices)
        .set({
          amountReceived: newReceived.toString(),
          status: nextStatus,
          paidAt: isFinalPaid ? (inv.paidAt ?? new Date()) : inv.paidAt,
        })
        .where(eq(invoices.id, inv.id));

      /* webhook_events insert later */
    });
  }
};

const scanChainLogs = async (
  chainId: number,
  { client, config }: ChainRuntime,
  latestBlock: bigint,
  deps: WatcherDeps,
  signal?: AbortSignal,
) => {
  const pendingInvoices = await getPendingInvoicesOnChain(deps, chainId);
  if (pendingInvoices.length === 0) {
    await setCursor({ chainId, lastProcessedBlock: latestBlock }, deps.db);
    return;
  }

  let fromBlock = await obtainStartBlock(deps, chainId, latestBlock);
  if (fromBlock > latestBlock) return;

  const tokenAddresses = Array.from(
    new Set(pendingInvoices.map((i) => i.tokenAddress as `0x${string}`)),
  );
  const invoiceAddresses = Array.from(
    new Set(pendingInvoices.map((i) => i.address as `0x${string}`)),
  );

  const mappedInvoices = new Map<string, Invoice>();
  for (const inv of pendingInvoices) {
    mappedInvoices.set(
      `${inv.tokenAddress.toLowerCase()}:${inv.address.toLowerCase()}`,
      inv,
    );
  }

  while (fromBlock <= latestBlock && !signal?.aborted) {
    const chunkEnd = fromBlock + config.maxBlockRange - 1n;
    const toBlock = chunkEnd < latestBlock ? chunkEnd : latestBlock;

    const logs = await client.getLogs({
      address: tokenAddresses,
      event: transferEvent,
      args: { to: invoiceAddresses },
      fromBlock,
      toBlock,
    });

    await deps.db.transaction(async (tx) => {
      for (const log of logs) {
        if (
          !validateLog(log) ||
          !log.args.from ||
          !log.args.to ||
          !log.args.value ||
          log.args.value <= 0n
        )
          continue;

        const key = `${log.address.toLowerCase()}:${log.args.to?.toLowerCase()}`;

        const inv = mappedInvoices.get(key);
        if (!inv) continue;

        await tx
          .insert(transfers)
          .values({
            invoiceId: inv.id,
            chainId,
            txHash: log.transactionHash.toLowerCase(),
            logIndex: log.logIndex,
            blockNumber: log.blockNumber,
            blockHash: log.blockHash.toLowerCase(),
            fromAddress: log.args.from.toLowerCase(),
            amount: log.args.value.toString(),
            status: "seen",
          })
          .onConflictDoNothing({
            target: [transfers.chainId, transfers.txHash, transfers.logIndex],
          });

        await tx
          .update(invoices)
          .set({ status: "detected" })
          .where(and(eq(invoices.id, inv.id), eq(invoices.status, "pending")));
      }

      await setCursor({ chainId, lastProcessedBlock: toBlock }, tx);
    });

    fromBlock = toBlock + 1n;
  }
};
