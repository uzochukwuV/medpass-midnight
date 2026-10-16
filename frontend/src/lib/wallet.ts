// Wallet discovery and connection over the Midnight DApp Connector API v4.
// Wallets inject themselves at window.midnight.<walletId>, where walletId is a
// generated UUID (not the old fixed `mnLace` name), so discovery iterates the
// object and filters for entries that expose `connect`.

import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export interface DiscoveredWallet {
  key: string;
  api: InitialAPI;
}

export function discoverWallets(): DiscoveredWallet[] {
  const injected = (window.midnight ?? {}) as Record<string, InitialAPI | undefined>;
  return Object.entries(injected)
    .filter(([, api]) => !!api && typeof (api as InitialAPI).connect === 'function')
    .map(([key, api]) => ({ key, api: api as InitialAPI }));
}

export function walletsAvailable(): boolean {
  return discoverWallets().length > 0;
}

export interface ConnectedWallet {
  api: ConnectedAPI;
  name: string;
  address: string;
  coinPublicKey: string;
  encryptionPublicKey: string;
  networkId: string;
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri?: string;
}

/**
 * Connect to a wallet on `networkId` and read back the addresses and service
 * configuration the wallet reports. We prefer the wallet's own indexer/prover
 * URIs (the user may have chosen them for privacy or performance).
 */
export async function connectWallet(networkId: string): Promise<ConnectedWallet> {
  const wallets = discoverWallets();
  if (wallets.length === 0) {
    throw new Error('No Midnight wallet found. Install Lace (Midnight edition) or 1AM and reload.');
  }
  const chosen = wallets[0];
  const api = await chosen.api.connect(networkId);

  const [addresses, unshielded, config] = await Promise.all([
    api.getShieldedAddresses(),
    api.getUnshieldedAddress(),
    api.getConfiguration(),
  ]);

  return {
    api,
    name: chosen.api.name || chosen.key,
    address: unshielded.unshieldedAddress || addresses.shieldedAddress,
    coinPublicKey: addresses.shieldedCoinPublicKey,
    encryptionPublicKey: addresses.shieldedEncryptionPublicKey,
    networkId: config.networkId,
    indexerUri: config.indexerUri,
    indexerWsUri: config.indexerWsUri,
    proverServerUri: config.proverServerUri,
  };
}

export async function isStillConnected(api: ConnectedAPI): Promise<boolean> {
  try {
    const status = await api.getConnectionStatus();
    return status.status === 'connected';
  } catch {
    return false;
  }
}
