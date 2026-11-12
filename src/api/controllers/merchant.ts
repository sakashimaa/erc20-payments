import type { AppDeps } from "../app";
import { createFactory } from "hono/factory";
import {
  createMerchantSchema,
  rotateMerchantParamSchema,
} from "../validations/merchant";
import { validateJson, validateParams } from "../utils/validation";
import { validateMerchantXpub, XpubValidationError } from "../../lib/xpub";
import { aadFor } from "../../lib/crypto";
import { apiKeys, merchants } from "../../db/schema";
import { generateApiKey } from "../../lib/api-keys";
import { isUniqueViolation } from "../../lib/db-errors";
import { generateWebhookSecret } from "../../lib/webhook-secret";
import { requireAdmin } from "../middleware/admin";
import { and, eq, isNull } from "drizzle-orm";
import { NotFoundError } from "../utils/http-error";

const factory = createFactory();

export const rotateMerchantSecrets = ({ adminToken, db, cipher }: AppDeps) =>
  factory.createHandlers(
    requireAdmin(adminToken),
    validateParams(rotateMerchantParamSchema),
    async (c) => {
      const { merchantId } = c.req.valid("param");

      const webhookSecret = generateWebhookSecret();
      const { key, hash, prefix } = await generateApiKey();

      const webhookSecretEnc = await cipher.encrypt(
        webhookSecret,
        aadFor(merchantId, "webhook_secret"),
      );

      await db.transaction(async (tx) => {
        const [m] = await tx
          .update(merchants)
          .set({ webhookSecretEnc, webhookSecretEncVersion: cipher.version })
          .where(eq(merchants.id, merchantId))
          .returning({ id: merchants.id });

        if (!m) throw new NotFoundError(`merchant ${merchantId} not found`);
        await tx
          .update(apiKeys)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(apiKeys.merchantId, merchantId), isNull(apiKeys.revokedAt)),
          );

        await tx.insert(apiKeys).values({ merchantId, prefix, keyHash: hash });
      });

      return c.json(
        {
          apiKey: key,
          webhookSecret,
        },
        200,
      );
    },
  );

export const createMerchant = ({
  allowInsecureWebhooks,
  cipher,
  fingerprinter,
  db,
  adminToken,
}: AppDeps) =>
  factory.createHandlers(
    requireAdmin(adminToken),
    validateJson(
      createMerchantSchema({
        allowInsecureWebhooks: allowInsecureWebhooks,
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");

      let hd;
      try {
        hd = validateMerchantXpub(body.xpub, body.firstAddress);
      } catch (e) {
        if (!(e instanceof XpubValidationError)) throw e;

        return c.json(
          {
            error: { code: `xpub_${e.reason}`, message: e.message },
          },
          400,
        );
      }

      const merchantUuid = crypto.randomUUID();
      const webhookSecret = generateWebhookSecret();

      const webhookSecretEnc = await cipher.encrypt(
        webhookSecret,
        aadFor(merchantUuid, "webhook_secret"),
      );
      const encXpub = await cipher.encrypt(
        body.xpub,
        aadFor(merchantUuid, "xpub"),
      );

      const fingerprint = await fingerprinter.fingerprintXpub(hd);

      const { key, hash, prefix } = await generateApiKey();

      try {
        await db.transaction(async (tx) => {
          await tx.insert(merchants).values({
            id: merchantUuid,
            name: body.name,
            webhookUrl: body.webhookUrl,
            webhookSecretEnc: webhookSecretEnc,
            webhookSecretEncVersion: cipher.version,
            xpubFingerprint: fingerprint,
            xpubEnc: encXpub,
            xpubEncVersion: cipher.version,
          });

          await tx.insert(apiKeys).values({
            merchantId: merchantUuid,
            prefix,
            keyHash: hash,
          });
        });
      } catch (e) {
        if (isUniqueViolation(e, "merchants_xpub_fingerprint_key")) {
          return c.json(
            {
              error: {
                code: "xpub_already_registered",
                message: "this xpub is already registered in system",
              },
            },
            409,
          );
        }

        throw e;
      }

      return c.json(
        {
          merchantId: merchantUuid,
          apiKey: key,
          webhookSecret,
        },
        201,
      );
    },
  );
