import { toHex } from "viem";
import {
  invoices,
  merchants,
  transfers,
  type InsertInvoice,
  type InsertMerchant,
  type InsertTransfer,
} from "../../src/db/schema";
import { db } from "../../src/db";
import { TEST_CHAIN_ID, TEST_TOKEN_ADDRESS } from "../fixtures/chain";
import crypto from "node:crypto";

let derivationCounter = 0;

export const randomHex = (bytes: number) =>
  toHex(crypto.getRandomValues(new Uint8Array(bytes)));

export const randomAddress = () => randomHex(20);
export const randomHash = () => randomHex(32);

export const insertMerchant = async (
  overrides: Partial<InsertMerchant> = {},
) => {
  const [row] = await db
    .insert(merchants)
    .values({
      name: `merchant-${crypto.randomUUID()}`,
      webhookUrl: "https://example.com/webhook",
      webhookSecretEnc: Buffer.from(crypto.getRandomValues(new Uint8Array(44))),
      webhookSecretEncVersion: 1,
      xpubEnc: Buffer.from(crypto.getRandomValues(new Uint8Array(140))),
      xpubEncVersion: 1,
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("insertMerchant: no row returned");
  return row;
};

export const insertInvoice = async (
  overrides: Partial<InsertInvoice> & Pick<InsertInvoice, "merchantId">,
) => {
  const [row] = await db
    .insert(invoices)
    .values({
      merchantOrderId: `order-${crypto.randomUUID()}`,
      chainId: TEST_CHAIN_ID,
      tokenAddress: TEST_TOKEN_ADDRESS,
      amount: "1000000",
      address: randomAddress(),
      derivationIndex: derivationCounter++,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("insertInvoice: no row returned");
  return row;
};

export const insertTransfer = async (
  overrides: Partial<InsertTransfer> & Pick<InsertTransfer, "invoiceId">,
) => {
  const [row] = await db
    .insert(transfers)
    .values({
      chainId: TEST_CHAIN_ID,
      txHash: randomHash(),
      logIndex: 0,
      blockNumber: 0n,
      blockHash: randomHash(),
      fromAddress: randomAddress(),
      amount: (2n ** 255n).toString(),
      status: "confirmed",
      ...overrides,
    })
    .returning();

  if (!row) throw new Error(`insertTransfer: no row returned`);
  return row;
};
