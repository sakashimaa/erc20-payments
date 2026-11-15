# erc20-payments

To install dependencies:

```bash
bun install
```

To run API:

```bash
bun run dev:api
```

## Merchant Xpub export CLI, how to build and run

Requirements:

- Git
- Bun

```bash
git clone https://github.com/sakashimaa/erc20-payments.git
cd erc20-payments
bun install --frozen-lockfile
bun run cli:xpub < mnemonic.txt # your mnemonic file
```
