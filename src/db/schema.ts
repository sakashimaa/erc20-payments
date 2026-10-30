import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const invoiceStatus = pgEnum("invoice_status", [
  "pending",
  "detected",
  "paid",
  "underpaid",
  "overpaid",
  "expired",
]);

export const transferStatus = pgEnum("transfer_status", [
  "seen",
  "confirmed",
  "orphaned",
]);

export const webhookEventStatus = pgEnum("webhook_event_status", [
  "pending",
  "delivered",
  "dead",
]);

export const chainCursors = pgTable("chain_cursors", {
  chainId: integer().primaryKey(),

  lastProcessedBlock: bigint({ mode: "bigint" }).notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const merchants = pgTable("merchants", {
  id: uuid().defaultRandom().primaryKey(),

  name: text().notNull(),

  webhookUrl: text().notNull(),
  webhookSecretEnc: bytea().notNull() /* iv(12) || ciphertext || tag */,
  webhookSecretEncVersion: integer().notNull(),

  xpubEnc: bytea().notNull() /* iv(12) || ciphertext || tag */,
  xpubEncVersion: integer().notNull(),

  nextDerivationIndex: integer().default(0).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid().defaultRandom().primaryKey(),

  merchantId: uuid()
    .references(() => merchants.id)
    .notNull(),
  prefix: text().unique().notNull(),
  keyHash: text().notNull() /* SHA-256 hash */,

  lastUsedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid().defaultRandom().primaryKey(),

    merchantId: uuid()
      .notNull()
      .references(() => merchants.id),
    merchantOrderId: text().notNull(),

    chainId: integer().notNull(),
    tokenAddress: text().notNull() /* lowercased */,

    amount: numeric({ precision: 78, scale: 0 }).notNull(),
    amountReceived: numeric({ precision: 78, scale: 0 }).default("0").notNull(),

    address: text().notNull(),
    derivationIndex: integer().notNull(),

    status: invoiceStatus().default("pending").notNull(),

    expiresAt: timestamp({ withTimezone: true }).notNull(),
    paidAt: timestamp({ withTimezone: true }),

    metadata: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("idx_invoices_merchant_id_merchant_order_id").on(
      t.merchantId,
      t.merchantOrderId,
    ),
    uniqueIndex("idx_invoices_merchant_id_derivation_index").on(
      t.merchantId,
      t.derivationIndex,
    ),
    uniqueIndex("idx_invoices_chain_id_address").on(
      t.chainId,
      t.address,
    ) /* unique addresses for each invoice */,
  ],
);

export const transfers = pgTable(
  "transfers",
  {
    id: uuid().defaultRandom().primaryKey(),

    invoiceId: uuid()
      .references(() => invoices.id)
      .notNull(),
    chainId: integer().notNull(),

    txHash: text().notNull(),
    logIndex: integer().notNull(),

    blockNumber: bigint({ mode: "bigint" }).notNull(),
    blockHash: text().notNull(),

    fromAddress: text().notNull(),
    amount: numeric({ precision: 78, scale: 0 }).notNull(),

    status: transferStatus().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_transfers_invoice_id").on(t.invoiceId),
    index("idx_transfers_chain_id_block_number").on(t.chainId, t.blockNumber),
    uniqueIndex("idx_transfers_chain_id_tx_hash_log_index").on(
      t.chainId,
      t.txHash,
      t.logIndex,
    ),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid().defaultRandom().primaryKey(),

    merchantId: uuid()
      .references(() => merchants.id)
      .notNull(),
    invoiceId: uuid()
      .references(() => invoices.id)
      .notNull(),
    type: text().notNull(),
    payload: jsonb().notNull(),

    status: webhookEventStatus().default("pending").notNull(),
    attempts: integer().default(0).notNull(),

    nextAttemptAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastError: text(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("idx_pending_events")
      .on(t.status, t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);
