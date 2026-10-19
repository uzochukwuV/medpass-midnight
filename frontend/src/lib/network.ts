import type { NetworkConfig } from './types';

const BLOCKFROST = (import.meta.env.VITE_BLOCKFROST_PROJECT_ID as string | undefined) ?? '';
const q = (base: string) => (BLOCKFROST ? `${base}?project_id=${BLOCKFROST}` : base);

/**
 * Endpoint configuration, mirroring scripts/shared/network.ts. When the wallet
 * is connected we prefer the URIs the wallet reports via getConfiguration();
 * these are the fallback.
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  preprod: {
    id: 'preprod',
    label: 'Midnight Preprod',
    indexerUri: q('https://midnight-preprod.blockfrost.io/api/v0'),
    indexerWsUri: q('wss://midnight-preprod.blockfrost.io/api/v0/ws'),
    proofServerUri: 'http://127.0.0.1:6300',
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
    requiresBlockfrost: true,
  },
  preview: {
    id: 'preview',
    label: 'Midnight Preview',
    indexerUri: 'https://indexer.preview.midnight.network/api/v1/graphql',
    indexerWsUri: 'wss://indexer.preview.midnight.network/api/v1/graphql/ws',
    proofServerUri: 'http://127.0.0.1:6300',
    faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
  },
  undeployed: {
    id: 'undeployed',
    label: 'Local devnet',
    indexerUri: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWsUri: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    proofServerUri: 'http://127.0.0.1:6300',
  },
};

export function resolveNetwork(id: string): NetworkConfig {
  return NETWORKS[id] ?? NETWORKS.preprod;
}

export const DEFAULT_NETWORK = (import.meta.env.VITE_NETWORK as string | undefined) ?? 'preprod';

/**
 * The verified preprod deployment (deployments/preprod.json). The app joins this
 * contract by default; "Deploy new" replaces it at runtime. Override with
 * VITE_CONTRACT_ADDRESS when pointing at a different deployment.
 */
export const DEPLOYED_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined) ??
  'a8d42dcd354f0a9cb5dfbfc0f38836b907e31f2c8e4533b9f3914e9e84d4bdc3';

export const EXPLORER_TX = (txId: string) =>
  `https://preprod.midnightexplorer.com/transactions/${txId}`;
