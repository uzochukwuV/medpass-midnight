// Network endpoints for MedPass. Defaults target the local Midnight devnet
// (midnight-local-dev: node 9944, indexer 8088, proof server 6300) on the
// `undeployed` network id. Every field is overridable via env.

export type NetworkId = 'undeployed' | 'preview' | 'preprod';

export interface NetworkConfig {
  id: NetworkId;
  indexer: string;
  indexerWS: string;
  node: string;
  nodeWS: string;
  proofServer: string;
}

const DEFAULTS: Record<NetworkId, NetworkConfig> = {
  undeployed: {
    id: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    node: 'http://127.0.0.1:9944',
    nodeWS: 'ws://127.0.0.1:9944',
    proofServer: 'http://127.0.0.1:6300',
  },
  preview: {
    id: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    nodeWS: 'wss://rpc.preview.midnight.network',
    proofServer: 'http://127.0.0.1:6300',
  },
  preprod: {
    id: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    nodeWS: 'wss://rpc.preprod.midnight.network',
    proofServer: 'http://127.0.0.1:6300',
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

export function resolveNetworkConfig(network: NetworkId, env = process.env): NetworkConfig {
  const d = DEFAULTS[network];
  return {
    id: network,
    indexer: env.MIDNIGHT_INDEXER_URL || d.indexer,
    indexerWS: env.MIDNIGHT_INDEXER_WS_URL || d.indexerWS,
    node: env.MIDNIGHT_NODE_URL || d.node,
    nodeWS: env.MIDNIGHT_NODE_WS_URL || d.nodeWS,
    proofServer: env.MIDNIGHT_PROOF_SERVER || d.proofServer,
  };
}
