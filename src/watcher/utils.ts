import { and, eq, inArray } from "drizzle-orm";
import type { WatcherDeps } from ".";
import { chainCursors, invoices, type InsertCursor } from "../db/schema";
import type { ChainClient } from "./config";

export const setCursor = async ({ db }: WatcherDeps, data: InsertCursor) => {
  const [inserted] = await db
    .insert(chainCursors)
    .values(data)
    .onConflictDoUpdate({
      target: chainCursors.chainId,
      set: { lastProcessedBlock: data.lastProcessedBlock },
    })
    .returning();

  if (!inserted) throw new Error("failed to set cursor");
  return inserted;
};

export const obtainStartBlock = async (
  { db }: WatcherDeps,
  { chainId, client }: { chainId: number; client: ChainClient },
) => {
  const [cursor] = await db
    .select()
    .from(chainCursors)
    .where(eq(chainCursors.chainId, chainId));
  if (!cursor) return (await client.getBlockNumber()) - 1n;

  return cursor.lastProcessedBlock;
};

export const getPendingInvoicesOnChain = async (
  { db }: WatcherDeps,
  chainId: number,
) =>
  await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.chainId, chainId),
        inArray(invoices.status, ["detected", "pending", "underpaid"]),
      ),
    );

export const preflight = async ({ runtimes }: WatcherDeps) => {
  if (runtimes.size === 0) throw new Error("no chains configured");

  await Promise.all(
    Array.from(runtimes.entries()).map(
      async ([expectedChainId, { client }]) => {
        const actualChainId = await client.getChainId();
        if (actualChainId !== expectedChainId)
          throw new Error(
            `RPC chainId mismatch: expected ${expectedChainId}, got ${actualChainId}`,
          );
      },
    ),
  );
};
