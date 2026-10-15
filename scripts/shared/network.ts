// Network endpoints for MedPass.
//
// - `undeployed` targets the local Midnight devnet (midnight-local-dev):
//   node 9944, indexer 8088, proof server 6300.
// - `preview` is Midnight-hosted and needs no token.
// - `preprod` is served by Blockfrost: every node and indexer URL must carry a
//   Blockfrost Midnight **Preprod** project token (prefix `nightpreprod`) as a
//   `?project_id=` query parameter. Set BLOCKFROST_PROJECT_ID (or
//   BLOCKFROST_PREPROD_PROJECT_ID) before selecting preprod.
//
// The Midnight-hosted preprod endpoints (indexer/rpc.preprod.midnight.network)
// were shut down on 2026-10-09. See:
//   https://docs.midnight.network/guides/networks-and-environments
//
// The proof server is always local (http://localhost:6300) on every network,
// because it handles private witness data.

export type NetworkId = 'undeployed' | 'preview' | 'preprod';

export interface NetworkConfig {
  id: NetworkId;
  indexer: string;
  indexerWS: string;
  node: string;
  nodeWS: string;
  proofServer: string;
}

export interface NetworkInfo {
  faucet: string | null;
  requiresBlockfrost: boolean;
  blockfrostUrl: string | null;
  explorer: string | null;
}

interface NetworkDefaults extends NetworkConfig {
  info: NetworkInfo;
}

const LOCAL_PROOF_SERVER = 'http://127.0.0.1:6300';

const PREPROD_BLOCKFROST = {
  node: 'https://rpc.midnight-preprod.blockfrost.io',
  nodeWS: 'wss://rpc.midnight-preprod.blockfrost.io',
  indexer: 'https://midnight-preprod.blockfrost.io/api/v0',
  indexerWS: 'wss://midnight-preprod.blockfrost.io/api/v0/ws',
};

const DEFAULTS: Record<NetworkId, NetworkDefaults> = {
  undeployed: {
    id: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    node: 'http://127.0.0.1:9944',
    nodeWS: 'ws://127.0.0.1:9944',
    proofServer: LOCAL_PROOF_SERVER,
    info: {
      faucet: null,
      requiresBlockfrost: false,
      blockfrostUrl: null,
      explorer: null,
    },
  },
  preview: {
    id: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    nodeWS: 'wss://rpc.preview.midnight.network',
    proofServer: LOCAL_PROOF_SERVER,
    info: {
      faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
      requiresBlockfrost: false,
      blockfrostUrl: null,
      explorer: 'https://preview.midnightexplorer.com/',
    },
  },
  preprod: {
    id: 'preprod',
    ...PREPROD_BLOCKFROST,
    proofServer: LOCAL_PROOF_SERVER,
    info: {
      faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
      requiresBlockfrost: true,
      blockfrostUrl: 'https://blockfrost.io',
      explorer: 'https://preprod.midnightexplorer.com/',
    },
  },
};

export const SUPPORTED_NETWORKS = Object.keys(DEFAULTS) as NetworkId[];

export function resolveNetwork(arg?: string): NetworkId {
  const id = (arg || process.env.MIDNIGHT_NETWORK || 'undeployed') as NetworkId;
  if (!(id in DEFAULTS)) {
    throw new Error(`Unsupported network "${id}". Use one of: ${SUPPORTED_NETWORKS.join(', ')}.`);
  }
  return id;
}

export function networkInfo(network: NetworkId): NetworkInfo {
  return DEFAULTS[network].info;
}

function blockfrostToken(env: NodeJS.ProcessEnv): string | undefined {
  return (env.BLOCKFROST_PROJECT_ID || env.BLOCKFROST_PREPROD_PROJECT_ID)?.trim() || undefined;
}

function withBlockfrostKey(url: string, token: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}project_id=${encodeURIComponent(token)}`;
}

export function resolveNetworkConfig(network: NetworkId, env = process.env): NetworkConfig {
  const d = DEFAULTS[network];
  const config: NetworkConfig = {
    id: network,
    indexer: env.MIDNIGHT_INDEXER_URL || d.indexer,
    indexerWS: env.MIDNIGHT_INDEXER_WS_URL || d.indexerWS,
    node: env.MIDNIGHT_NODE_URL || d.node,
    nodeWS: env.MIDNIGHT_NODE_WS_URL || d.nodeWS,
    proofServer: env.MIDNIGHT_PROOF_SERVER || d.proofServer,
  };

  if (d.info.requiresBlockfrost) {
    const token = blockfrostToken(env);
    if (!token) {
      throw new Error(
        `${network} is served by Blockfrost and needs a project token. Create a Midnight ` +
          `${network} project at https://blockfrost.io (its id starts with "nightpreprod") and ` +
          'export BLOCKFROST_PROJECT_ID, or use the token-free "preview" network.',
      );
    }
    // A caller-supplied explicit URL is passed through untouched.
    if (!env.MIDNIGHT_NODE_URL) config.node = withBlockfrostKey(config.node, token);
    if (!env.MIDNIGHT_NODE_WS_URL) config.nodeWS = withBlockfrostKey(config.nodeWS, token);
    if (!env.MIDNIGHT_INDEXER_URL) config.indexer = withBlockfrostKey(config.indexer, token);
    if (!env.MIDNIGHT_INDEXER_WS_URL) config.indexerWS = withBlockfrostKey(config.indexerWS, token);
  }

  return config;
}
