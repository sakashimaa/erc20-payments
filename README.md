# erc20-payments

Non-custodial ERC-20 payment gateway. Merchants register an extended public key (`xpub`), and the service derives a unique deposit address per invoice without ever storing private keys.

**Stack:** Bun, Hono, Drizzle ORM, PostgreSQL 17, viem, Zod.

## Requirements

- [Bun](https://bun.sh/)
- Docker (for PostgreSQL and local Anvil node)

## Quick Start

1. Install dependencies:

```bash
bun install --frozen-lockfile
```

2. Configure environment variables:

```bash
cp .env.example .env
```

Generate the required secrets and fill in `.env`:

```bash
openssl rand -base64 32 # DATA_ENC_KEY
openssl rand -base64 32 # XPUB_FINGERPRINT_KEY
openssl rand -hex 32    # ADMIN_TOKEN
```

3. Start PostgreSQL (and Anvil) and apply migrations:

```bash
bun run test:infra
bun run db:migrate
```

4. Run the API server:

```bash
bun run dev:api
```

## Testing & Quality Checks

```bash
bun run test:unit         # unit tests (src/)
bun run test:infra        # start PostgreSQL + Anvil containers
bun run test:integration  # integration tests (loads .env.test, recreates *_test DB)

bun run typecheck
bun run lint
bun run format:check
```

> **Note:** Integration tests load `.env.test` and drop/recreate the configured `*_test` database on each run (see `tests/setup.ts`).

## Offline Xpub Export CLI

Derives a BIP-44 external-chain `xpub` (`m/44'/60'/<account>'/0`) and its first address (`index 0`) from a BIP-39 mnemonic. Runs fully offline and never prints secrets.

```bash
bun run cli:xpub < mnemonic.txt
bun run cli:xpub --account 1 --passphrase < secrets.txt
bun run cli:xpub --json < mnemonic.txt
```

Build a standalone binary:

```bash
bun run cli:build
```

## Documentation

- [Architecture & Design Decisions](docs/architecture.md)
- [API Reference](docs/api.md)
- [Security & Threat Model](docs/security.md)
