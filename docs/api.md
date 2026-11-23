# API Reference

All `/api/*` endpoints accept and return JSON (`Content-Type: application/json`) and enforce a **32 KB** request body limit.

## Authentication

| Scope | Header |
| --- | --- |
| Admin (`/api/merchants/*`) | `Authorization: Bearer <ADMIN_TOKEN>` |
| Merchant (`/api/invoices/*`) | `Authorization: Bearer sk_live_<prefix>_<secret>` |
| Health (`/health`) | None |

## Error Format

All `/api/*` errors follow the same envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "invalid json",
    "issues": [
      { "path": "amount", "message": "amount must be a positive integer string" }
    ]
  }
}
```

`issues` is present only on `validation_error` responses.

---

## Endpoints

### `GET /health`

Checks database connectivity.

**Response `200 OK`:**
```json
{ "status": "healthy" }
```

**Response `503 Service Unavailable`:**
```json
{ "status": "unhealthy", "message": "db is not available" }
```

---

### `POST /api/merchants`

Registers a new merchant and issues its initial API key and webhook signing secret.

- **Auth:** Admin (`ADMIN_TOKEN`)
- **Response headers:** `Cache-Control: no-store`

**Request body:**
```json
{
  "name": "Acme Store",
  "webhookUrl": "https://merchant.example.com/webhooks/payments",
  "xpub": "xpub6F...",
  "firstAddress": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
}
```

| Field | Rules |
| --- | --- |
| `name` | String, trimmed, 1–100 chars |
| `webhookUrl` | Valid `https://` URL (`http://` allowed only in `development`) |
| `xpub` | BIP-44 external-chain extended public key (`m/44'/60'/<account>'/0`, depth 4), 1–120 chars |
| `firstAddress` | Valid EVM address matching `deriveAddress(xpub, 0)` |

**Response `201 Created`:**
```json
{
  "merchantId": "550e8400-e29b-41d4-a716-446655440000",
  "apiKey": "sk_live_<16-hex>_<64-hex>",
  "webhookSecret": "whsec_<64-hex>"
}
```

**Errors:** `400` (`validation_error`, `xpub_invalid_format`, `xpub_private_key`, `xpub_wrong_depth`, `xpub_address_mismatch`), `401` (`unauthorized`), `409` (`xpub_already_registered`), `413` (`payload_too_large`).

---

### `POST /api/merchants/:merchantId/rotate`

Atomically rotates a merchant's webhook secret and API key. All previously active API keys for this merchant are immediately revoked.

- **Auth:** Admin (`ADMIN_TOKEN`)
- **Path params:** `merchantId` (UUID)
- **Response headers:** `Cache-Control: no-store`

**Response `200 OK`:**
```json
{
  "apiKey": "sk_live_<16-hex>_<64-hex>",
  "webhookSecret": "whsec_<64-hex>"
}
```

**Errors:** `400` (`validation_error`), `401` (`unauthorized`), `404` (`not_found`).

---

### `POST /api/invoices`

Creates a new payment invoice and derives a fresh deposit address for the authenticated merchant. Invoices expire **1 hour** after creation.

- **Auth:** Merchant API key (`sk_live_...`)

**Request body:**
```json
{
  "merchantOrderId": "order-12345",
  "chainId": 11155111,
  "tokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "amount": "1000000",
  "metadata": {
    "customerId": "cust_42"
  }
}
```

| Field | Rules |
| --- | --- |
| `merchantOrderId` | String, trimmed, 1–128 chars; unique per merchant |
| `chainId` | Integer present in `SUPPORTED_CHAIN_IDS` |
| `tokenAddress` | Valid EVM address (strict EIP-55 if mixed-case); `0x0000...0000` rejected; stored lowercased |
| `amount` | Positive integer string in token's smallest unit (`1 .. 2^256 - 1`, no leading zeros) |
| `metadata` | Optional JSON object, max `4096` UTF-8 bytes serialized |

**Response `201 Created`:**
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "expiresAt": "2026-11-23T10:00:00.000Z"
}
```

**Errors:** `400` (`validation_error`), `401` (`unauthorized`), `409` (`merchant_order_registered`), `413` (`payload_too_large`).

---

## Error Codes

| HTTP Status | `error.code` | Description |
| --- | --- | --- |
| `400` | `validation_error` | Request body or path params failed Zod validation |
| `400` | `xpub_invalid_format` | `xpub` is not a valid Base58Check extended key |
| `400` | `xpub_private_key` | Private extended key (`xprv`) was submitted instead of `xpub` |
| `400` | `xpub_wrong_depth` | `xpub` depth is not 4 (`m/44'/60'/<account>'/0`) |
| `400` | `xpub_address_mismatch` | `firstAddress` does not match `deriveAddress(xpub, 0)` |
| `400` | `http_error` | Malformed JSON body or generic HTTP exception |
| `401` | `unauthorized` | Missing, malformed, invalid, or revoked Bearer token |
| `404` | `not_found` | Target resource (e.g. merchant) does not exist |
| `409` | `xpub_already_registered` | Another merchant is already registered with the same `xpub` |
| `409` | `merchant_order_registered` | `merchantOrderId` already exists for this merchant |
| `413` | `payload_too_large` | Request body exceeds `32 KB` |
| `500` | `internal_error` | Unexpected server error |
