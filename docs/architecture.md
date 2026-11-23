# Architecture & Design Decisions

This document records the core invariants and design decisions behind `erc20-payments` — specifically *why* things are built the way they are, so future changes (indexer, webhooks, key rotation) preserve them.

---

## 1. Non-Custodial HD Address Derivation

- **Derivation path:** `m/44'/60'/{account}'/0/{index}`.
- **Why depth 4 (`.../0`):** Merchants export and register only the external-chain `xpub` (depth 4) using the offline CLI (`src/cli/export-xpub.ts`). The server derives child public keys non-hardened (`0 <= index < 2^31`) and converts them to Ethereum addresses. Private keys never touch the server.
- **Registration validation (`src/lib/xpub.ts`):**
  - Rejects malformed extended keys (`invalid_format`).
  - Rejects private extended keys (`xprv`, `private_key`) and avoids leaking raw key material in error messages or causes.
  - Enforces `depth === 4` (`wrong_depth`) so an account-level `xpub` (`m/44'/60'/0'`) cannot be registered by mistake and silently derive unreachable addresses.
  - Requires `firstAddress` to match `deriveAddress(xpub, 0)` (`address_mismatch`) as a sanity check that the merchant's wallet agrees on the derivation path.

---

## 2. Atomic Derivation Index Allocation & Rollback

When creating an invoice (`POST /api/invoices`), reserving the next index and inserting the invoice happen inside a **single PostgreSQL transaction**:

1. `UPDATE merchants SET next_derivation_index = next_derivation_index + 1 WHERE id = $1 RETURNING xpub_enc, next_derivation_index - 1 AS derivation_index`
2. Decrypt `xpub`, derive `invoiceAddress` at `derivation_index`.
3. `INSERT INTO invoices (...)`.

**Why:**
- **Concurrency safety:** The `UPDATE` acquires a row-level lock on the merchant row, serializing concurrent invoice creations for the same merchant without application-level locks.
- **No index gaps on conflicts:** If `INSERT` fails with unique violation `23505` on `(merchant_id, merchant_order_id)` (`409 merchant_order_registered`), the entire transaction rolls back — including the `next_derivation_index` increment. Avoiding gaps matters for HD wallet recovery (BIP-44 gap limit).

---

## 3. Encryption at Rest (AES-256-GCM + AAD + Versioning)

Sensitive merchant data (`merchants.xpub_enc` and `merchants.webhook_secret_enc`) is encrypted with AES-256-GCM (`src/lib/crypto.ts`).

- **Storage format (`bytea`):** `iv (12 bytes) || ciphertext || auth tag (16 bytes)`.
- **Additional Authenticated Data (AAD):** `aadFor(merchantId, purpose)` encodes `"${merchantId}:${purpose}"` where `purpose` is `"xpub"` or `"webhook_secret"`. Binding the ciphertext to both the merchant ID and field purpose prevents swapping encrypted blobs across merchants or columns in the database.
- **Key versioning:** `xpub_enc_version` and `webhook_secret_enc_version` are stored alongside each ciphertext to support zero-downtime `DATA_ENC_KEY` rotation in the future.

---

## 4. Xpub Deduplication via HMAC Fingerprinting

Each merchant must have a unique `xpub`, enforced by `merchants_xpub_fingerprint_key`.

- **Why not hash the raw `xpub` string:** Base58Check `xpub` strings include non-cryptographic metadata (such as the 4-byte parent fingerprint). Flipping those bytes yields a different string that still derives the exact same child addresses.
- **How it works:** `fingerprintXpub` computes `HMAC-SHA256(XPUB_FINGERPRINT_KEY, compressedPublicKey (33B) || chainCode (32B))`. This deduplicates on the actual cryptographic key material and uses a keyed HMAC so a leaked database cannot be matched offline against known public keys.

---

## 5. Authentication & Secret Rotation

- **Admin routes (`/api/merchants`, `/api/merchants/:merchantId/rotate`):** Authenticated via `Authorization: Bearer <ADMIN_TOKEN>` using `safeEqual` (timing-safe comparison of SHA-256 digests to avoid length/byte timing leaks).
- **Merchant routes (`/api/invoices`):** Authenticated via API keys formatted as `sk_live_<16-hex-prefix>_<64-hex-secret>`:
  - Active key is looked up by unique indexed `prefix` with `revoked_at IS NULL`.
  - Full token is verified against the stored SHA-256 `key_hash` using `crypto.timingSafeEqual`.
  - `api_keys.last_used_at` is updated **only after** `verifyApiKey` succeeds, so failed attempts with a valid prefix do not overwrite usage timestamps.
- **Atomic rotation (`POST /api/merchants/:merchantId/rotate`):** Updates `webhook_secret_enc`, revokes all active API keys (`revoked_at = now()`), and inserts the new API key inside one transaction.
- **Caching:** Merchant creation and rotation routes apply `Cache-Control: no-store` so plaintext `apiKey` and `webhookSecret` are never cached by intermediaries.

---

## 6. Amounts, Addresses & Request Limits

- **Amounts:** Passed as positive integer strings in the token's smallest unit (`1 .. maxUint256`, no leading zeros) and stored in PostgreSQL as `numeric(78, 0)`. Floating-point numbers are never used for money.
- **Token addresses:** Validated with `viem`'s `isAddress` (enforcing EIP-55 checksum when mixed-case), explicitly rejecting `0x0000000000000000000000000000000000000000`, and normalized to lowercase before storage.
- **Payload limits:** `/api/*` enforces a `32 KB` HTTP body limit (`413 payload_too_large`). Invoice `metadata` JSONB is additionally capped at `4 KB` (UTF-8 bytes) at validation time.
- **Webhook URLs:** Require `https://` by default; `http://` is only permitted when `allowInsecureWebhooks` is enabled (development / tests).

---

## 7. Dependency Injection & Testability

`createApp(deps: AppDeps)` wires all runtime dependencies (`db`, `logger`, `cipher`, `fingerprinter`, `allowInsecureWebhooks`, `adminToken`, `supportedChainIds`) into routes, middlewares, and Zod schemas.

- Modules under `src/api/` never import `src/config/api-env.ts` directly.
- Integration tests run the real Hono app against a real PostgreSQL test database with controlled `AppDeps`, without relying on production environment variables.

---

## 8. Key Database Invariants & Planned Components

The schema (`src/db/schema.ts`) already enforces the invariants needed for the full payment pipeline:

- `merchants_xpub_fingerprint_key` — one merchant per HD keypair.
- `idx_invoices_merchant_id_merchant_order_id` — unique order ID per merchant (different merchants may reuse the same `merchantOrderId`).
- `idx_invoices_merchant_id_derivation_index` — unique derivation index per merchant.
- `idx_invoices_chain_id_address` — unique deposit address per chain.
- `idx_transfers_chain_id_tx_hash_log_index` — idempotent ingestion of ERC-20 `Transfer` logs.

**Planned (schema already in place):**
- **Chain indexer:** Tracks per-chain progress in `chain_cursors`, ingests ERC-20 transfers into `transfers`, and handles chain reorganizations via `transfer_status` (`seen → confirmed | orphaned`).
- **Invoice lifecycle:** Transitions `invoice_status` (`pending → detected → paid | underpaid | overpaid | expired`).
- **Webhook delivery worker:** Polls `webhook_events` using partial index `idx_pending_events` (`status = 'pending'`), signs payloads with the decrypted `webhook_secret`, and retries with backoff until `delivered` or `dead`.
