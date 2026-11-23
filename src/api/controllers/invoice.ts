import { createFactory } from "hono/factory";
import type { AppDeps } from "../app";
import { requireApiKey } from "../middleware/merchant";
import { invoices, merchants } from "../../db/schema";
import { eq, sql } from "drizzle-orm";
import { HttpError } from "../utils/http-error";
import { aadFor } from "../../lib/crypto";
import { deriveAddress } from "../../lib/hd";
import { validateJson } from "../utils/validation";
import { createInvoiceSchema } from "../validations/invoice";
import { isUniqueViolation } from "../../lib/db-errors";

const factory = createFactory();

const INVOICE_EXPIRES_IN_MS = 60 * 1000 * 60;

export const createInvoice = (deps: AppDeps) =>
  factory.createHandlers(
    requireApiKey(deps),
    validateJson(
      createInvoiceSchema({ supportedChainIds: deps.supportedChainIds }),
    ),
    async (c) => {
      const merchantId = c.var.merchantId;
      const body = c.req.valid("json");
      try {
        const created = await deps.db.transaction(async (tx) => {
          const [m] = await tx
            .update(merchants)
            .set({
              nextDerivationIndex: sql`${merchants.nextDerivationIndex} + 1`,
            })
            .where(eq(merchants.id, merchantId))
            .returning({
              id: merchants.id,
              xpubEnc: merchants.xpubEnc,
              derivationIndex: sql<number>`${merchants.nextDerivationIndex} - 1`,
            });

          if (!m) throw new HttpError(500, "unknown error", "internal_error");

          const xpubDecrypted = await deps.cipher.decrypt(
            m.xpubEnc,
            aadFor(merchantId, "xpub"),
          );

          const invoiceAddress = deriveAddress(
            xpubDecrypted,
            m.derivationIndex,
          );

          const [i] = await tx
            .insert(invoices)
            .values({
              merchantId: merchantId,
              merchantOrderId: body.merchantOrderId,
              chainId: body.chainId,
              tokenAddress: body.tokenAddress,
              amount: body.amount.toString(),
              address: invoiceAddress,
              derivationIndex: m.derivationIndex,
              expiresAt: new Date(Date.now() + INVOICE_EXPIRES_IN_MS),
              metadata: body.metadata,
            })
            .returning({
              id: invoices.id,
              address: invoices.address,
              expiresAt: invoices.expiresAt,
            });

          if (!i)
            throw new HttpError(
              500,
              "failed to create invoice",
              "invoice_creation_failed",
            );

          return i;
        });

        return c.json(
          {
            id: created.id,
            address: created.address,
            expiresAt: created.expiresAt,
          },
          201,
        );
      } catch (e) {
        if (
          isUniqueViolation(e, "idx_invoices_merchant_id_merchant_order_id")
        ) {
          return c.json(
            {
              error: {
                code: "merchant_order_registered",
                message: "this order id already registered for merchant",
              },
            },
            409,
          );
        }

        throw e;
      }
    },
  );
