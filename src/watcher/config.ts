import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type Transport,
} from "viem";
import {
  arbitrum,
  base,
  baseSepolia,
  foundry,
  mainnet,
  sepolia,
} from "viem/chains";

export type ChainClient = PublicClient<Transport, Chain>;

export type ChainConfig = {
  chain: Chain;
  confirmations: bigint;
  maxBlockRange: bigint;
  pollIntervalMs: number;
};

export type ChainRuntime = {
  config: ChainConfig;
  client: ChainClient;
};

const CHAIN_REGISTRY: Record<number, ChainConfig> = {
  [mainnet.id]: {
    chain: mainnet,
    confirmations: 12n,
    maxBlockRange: 500n,
    pollIntervalMs: 12_000,
  },
  [arbitrum.id]: {
    chain: arbitrum,
    confirmations: 20n,
    maxBlockRange: 2_000n,
    pollIntervalMs: 2_000,
  },
  [base.id]: {
    chain: base,
    confirmations: 10n,
    maxBlockRange: 2_000n,
    pollIntervalMs: 2_000,
  },
  [sepolia.id]: {
    chain: sepolia,
    confirmations: 3n,
    maxBlockRange: 10n,
    pollIntervalMs: 12_000,
  },
  [baseSepolia.id]: {
    chain: baseSepolia,
    confirmations: 3n,
    maxBlockRange: 2_000n,
    pollIntervalMs: 2_000,
  },
  [foundry.id]: {
    chain: foundry,
    confirmations: 3n,
    maxBlockRange: 100_000n,
    pollIntervalMs: 500,
  },
};

export const createChainRuntimes = (
  rpcByChainId: ReadonlyMap<number, string>,
): ReadonlyMap<number, ChainRuntime> => {
  const runtimes = new Map<number, ChainRuntime>();

  for (const [chainId, rpcUrl] of rpcByChainId) {
    const config = CHAIN_REGISTRY[chainId];
    if (!config) throw new Error(`unsupported chainId in env: ${chainId}`);

    const client = createPublicClient({
      chain: config.chain,
      transport: http(rpcUrl, {
        timeout: 10_000,
        retryCount: 2,
      }),
    });

    runtimes.set(chainId, { config, client });
  }

  return runtimes;
};
