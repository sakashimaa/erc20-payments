import type { AppDeps } from "../../src/api/app";

export interface CreateInvoiceBody {
  merchantOrderId: string;
  chainId: number;
  tokenAddress: string;
  amount: string;
  metadata?: unknown;
}

export const USDT_TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

export const validInvoice = (
  { supportedChainIds }: AppDeps,
  overrides?: Partial<CreateInvoiceBody>,
): CreateInvoiceBody => {
  return {
    merchantOrderId: crypto.randomUUID(),
    chainId: supportedChainIds.values().next().value || 11155111,
    tokenAddress: USDT_TOKEN,
    amount: "1000000",
    ...overrides,
  };
};
