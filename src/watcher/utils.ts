import { and, eq, inArray } from "drizzle-orm";
import { chainCursors, invoices, type InsertCursor } from "../db/schema";
import type { DB, Tx } from "../db";
import { parseRpcUrls } from "../config/watcher-env";
import type { WatcherDeps } from "./processor";

export const setCursor = async (data: InsertCursor, executor: DB | Tx) => {
  const [inserted] = await executor
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

export const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal.addEventListener("abort", onAbort, { once: true });
  });

export const obtainStartBlock = async (
  { db }: WatcherDeps,
  chainId: number,
  latestBlock: bigint,
) => {
  const [cursor] = await db
    .select()
    .from(chainCursors)
    .where(eq(chainCursors.chainId, chainId));

  if (!cursor) return latestBlock;
  return cursor.lastProcessedBlock + 1n;
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

  const fromEnv = parseRpcUrls(process.env);
  const missingInRuntimes = [...fromEnv.keys()].filter(
    (id) => !runtimes.has(id),
  );
  const missingInEnv = [...runtimes.keys()].filter((id) => !fromEnv.has(id));

  if (missingInRuntimes.length > 0 || missingInEnv.length > 0)
    throw new Error(
      `RPC/Runtime mismatch. Missing in env: ${missingInEnv.join(", ")}. Missing in runtimes: ${missingInRuntimes.join(", ")}`,
    );

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
