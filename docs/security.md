# Security & Threat Model

## Core Security Property: Non-Custodial Design

`erc20-payments` never generates, receives, or stores private keys. Merchants export only a BIP-44 external-chain `xpub` (`m/44'/60'/<account>'/0`) using the offline CLI (`src/cli/export-xpub.ts`). Even a full compromise of the API server and PostgreSQL database **cannot** be used to spend or sweep merchant funds.

---

## Threat Model

| Compromised Asset | Blast Radius | Mitigations in Place |
| --- | --- | --- |
| **PostgreSQL database dump** | Exposes invoice metadata, deposit addresses, and encrypted blobs. Cannot spend funds, recover plaintext `xpub`/`webhookSecret`, or authenticate as merchants. | `xpub` and `webhookSecret` are AES-256-GCM encrypted with per-merchant AAD; API keys are stored only as SHA-256 hashes; `xpub_fingerprint` is keyed HMAC-SHA256. |
| **`DATA_ENC_KEY`** | Alone: no impact. Combined with DB access: exposes merchant `xpub` (address privacy) and `webhookSecret` (ability to forge webhooks). Still cannot spend funds. | Separate key from `XPUB_FINGERPRINT_KEY` and `ADMIN_TOKEN`; `*_enc_version` columns support key rotation. |
| **`ADMIN_TOKEN`** | Can register new merchants and rotate existing merchants' API keys / webhook secrets (causing denial of service or webhook spoofing). Cannot spend funds. | Minimum 32-char requirement in env validation; timing-safe comparison (`safeEqual`); keep restricted to internal admin network/CI. |
| **Merchant `apiKey`** | Can create invoices for that merchant (potentially exhausting derivation indices / triggering gap-limit issues). Cannot access other merchants or spend funds. | Immediate revocation via `POST /api/merchants/:merchantId/rotate`; per-merchant isolation via `c.var.merchantId`; `last_used_at` tracks key activity. |
| **Merchant `webhookSecret`** | Attacker can forge payment webhook notifications to the merchant's backend. | Immediate rotation via `POST /api/merchants/:merchantId/rotate`; `https://`-only webhook URLs in production. |
| **Accidental `xprv` upload** | Merchant mistakenly sends private extended key during onboarding. | Explicitly rejected with `400 xpub_private_key`; validation errors never include the raw key in `message`, `stack`, or `cause`. |

---

## Cryptographic & API Controls

- **Authenticated encryption (`src/lib/crypto.ts`):** AES-256-GCM with random 12-byte IV per encryption and `AAD = "${merchantId}:${purpose}"`. Ciphertext cannot be transplanted between merchants or between `xpub_enc` and `webhook_secret_enc`.
- **Constant-time secret comparison:** Both `ADMIN_TOKEN` (`safeEqual`) and merchant API keys (`verifyApiKey`) use `crypto.timingSafeEqual` over fixed-length SHA-256 digests.
- **Auth before validation:** `requireApiKey` and `requireAdmin` run before JSON body validation, preventing unauthenticated callers from probing validation logic.
- **No timestamp pollution on failed auth:** `api_keys.last_used_at` is updated only after `verifyApiKey` succeeds.
- **No secret caching:** `/api/merchants/*` responses set `Cache-Control: no-store`.
- **Input hardening:**
  - `32 KB` HTTP body limit on `/api/*` (`413 payload_too_large`).
  - `4 KB` UTF-8 limit on invoice `metadata` JSONB.
  - Strict EIP-55 checksum validation for mixed-case addresses and explicit rejection of `0x0000000000000000000000000000000000000000`.
  - `https://` required for `webhookUrl` unless `NODE_ENV=development` (`allowInsecureWebhooks`).

---

## Operational Procedures

### Generating Environment Secrets

```bash
openssl rand -base64 32 # DATA_ENC_KEY (must decode to exactly 32 bytes)
openssl rand -base64 32 # XPUB_FINGERPRINT_KEY (must decode to exactly 32 bytes)
openssl rand -hex 32    # ADMIN_TOKEN (minimum 32 chars)
```

Never reuse the same key for `DATA_ENC_KEY` and `XPUB_FINGERPRINT_KEY`.

### Rotating a Compromised Merchant Key or Webhook Secret

Call `POST /api/merchants/:merchantId/rotate` with `ADMIN_TOKEN`:
- Revokes all active API keys for the merchant immediately (`revoked_at = now()`).
- Encrypts and stores a new `webhook_secret_enc`.
- Returns the new `apiKey` and `webhookSecret` once (with `Cache-Control: no-store`).

### Key Versioning (`DATA_ENC_KEY_VERSION`)

Every encrypted column stores the key version used to encrypt it (`xpub_enc_version`, `webhook_secret_enc_version`). When `DATA_ENC_KEY` rotation is needed, introduce a multi-key keyring keyed by version, increment `DATA_ENC_KEY_VERSION` for new writes, and re-encrypt existing rows in a background migration before retiring the old key.
