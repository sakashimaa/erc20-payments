import { beforeEach, describe, expect, test } from "bun:test";
import {
  insertInvoice,
  insertMerchant,
  insertTransfer,
  randomAddress,
  randomHash,
} from "../helpers/factories";
import { expectPgError } from "../helpers/tests";
import { TEST_CHAIN_ID } from "../fixtures/chain";
import { truncateAll } from "../helpers/db";

beforeEach(async () => {
  await truncateAll();
});

describe("db schema invariant tests", () => {
  test("rejects duplicate merchant_order_id for the same merchant", async () => {
    const merchant = await insertMerchant();

    await insertInvoice({
      merchantId: merchant.id,
      merchantOrderId: "order-1",
    });

    await expectPgError(
      () =>
        insertInvoice({ merchantId: merchant.id, merchantOrderId: "order-1" }),
      "23505",
      "idx_invoices_merchant_id_merchant_order_id",
    );
  });

  test("accepts same merchant_order_id for other merchants", async () => {
    const merchant1 = await insertMerchant();
    const merchant2 = await insertMerchant();

    await insertInvoice({
      merchantId: merchant1.id,
      merchantOrderId: "order-1",
    });

    const invoice = await insertInvoice({
      merchantId: merchant2.id,
      merchantOrderId: "order-1",
    });
    expect(invoice.merchantOrderId).toBe("order-1");
  });

  test("rejects same chainId and address for different merchants", async () => {
    const merchant1 = await insertMerchant();
    const merchant2 = await insertMerchant();
    const address = randomAddress();

    await insertInvoice({
      merchantId: merchant1.id,
      chainId: TEST_CHAIN_ID,
      address,
    });

    await expectPgError(
      () =>
        insertInvoice({
          merchantId: merchant2.id,
          chainId: TEST_CHAIN_ID,
          address,
        }),
      "23505",
      "idx_invoices_chain_id_address",
    );
  });

  test("rejects same derivation index with same merchant", async () => {
    const merchant = await insertMerchant();

    await insertInvoice({
      merchantId: merchant.id,
      derivationIndex: 1,
    });

    await expectPgError(
      () => insertInvoice({ merchantId: merchant.id, derivationIndex: 1 }),
      "23505",
      "idx_invoices_merchant_id_derivation_index",
    );
  });

  test("accepts same derivation index for different merchants", async () => {
    const merchant1 = await insertMerchant();
    const merchant2 = await insertMerchant();

    await insertInvoice({
      merchantId: merchant1.id,
      derivationIndex: 1,
    });

    const invoice = await insertInvoice({
      merchantId: merchant2.id,
      derivationIndex: 1,
    });
    expect(invoice.derivationIndex).toBe(1);
  });

  test("rejects same transfer chainId txHash and logIndex", async () => {
    const merchant = await insertMerchant();
    const invoice = await insertInvoice({
      merchantId: merchant.id,
    });
    const hash = randomHash();

    await insertTransfer({
      invoiceId: invoice.id,
      chainId: TEST_CHAIN_ID,
      txHash: hash,
      logIndex: 0,
    });

    await expectPgError(
      () =>
        insertTransfer({
          invoiceId: invoice.id,
          txHash: hash,
          logIndex: 0,
        }),
      "23505",
      "idx_transfers_chain_id_tx_hash_log_index",
    );
  });

  test("same buffer returned", async () => {
    const buffer = Buffer.from(crypto.getRandomValues(new Uint8Array(20)));
    const merchant = await insertMerchant({
      webhookSecretEnc: buffer,
      xpubEnc: buffer,
    });

    expect(merchant.webhookSecretEnc).toEqual(buffer);
    expect(merchant.xpubEnc).toEqual(buffer);
  });

  test("same amount returned", async () => {
    const merchant = await insertMerchant();
    const invoice = await insertInvoice({
      merchantId: merchant.id,
    });

    const inserted = await insertTransfer({ invoiceId: invoice.id });
    expect(inserted.amount).toBe((2n ** 255n).toString());
  });
});
