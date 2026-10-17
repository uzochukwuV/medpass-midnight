// Wallet discovery and connection over the Midnight DApp Connector API v4.
//
// Wallets inject themselves at window.midnight.<walletId>, where walletId is a
// generated UUID (not the old fixed `mnLace` name), so discovery iterates the
// object and filters for entries that expose `connect`. Compatibility is gated
// on the connector API version the wallet reports, matching Midnight's own
// browser example.

import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

/** Connector API major version this app is written against. */
const COMPATIBLE_API = /^4\./;

export interface DiscoveredWallet {
  key: string;
  api: InitialAPI;
  name: string;
  rdns: string;
  icon: string;
  apiVersion: string;
}

export function discoverWallets(): DiscoveredWallet[] {
  const injected = (window.midnight ?? {}) as Record<string, InitialAPI | undefined>;
  return Object.entries(injected)
    .filter(([, api]) => !!api && typeof (api as InitialAPI).connect === 'function')
    .map(([key, api]) => ({
      key,
      api: api as InitialAPI,
      name: (api as InitialAPI).name || key,
      rdns: (api as InitialAPI).rdns || key,
      icon: (api as InitialAPI).icon || '',
      apiVersion: (api as InitialAPI).apiVersion || '',
    }));
}

/** Wallets whose connector API this app can actually drive. */
export function compatibleWallets(): DiscoveredWallet[] {
  return discoverWallets().filter((w) => COMPATIBLE_API.test(w.apiVersion));
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
 *
 * `walletKey` selects a specific injected wallet; without it the first
 * compatible one is used.
 */
export async function connectWallet(networkId: string, walletKey?: string): Promise<ConnectedWallet> {
  const wallets = compatibleWallets();
  if (wallets.length === 0) {
    const all = discoverWallets();
    if (all.length > 0) {
      throw new Error(
        `Found ${all.length} wallet(s) but none report a compatible connector API (need 4.x): ` +
          all.map((w) => `${w.name} ${w.apiVersion || 'unknown'}`).join(', '),
      );
    }
    throw new Error('No Midnight wallet found. Install Lace (Midnight edition) or 1AM and reload.');
  }

  const chosen = (walletKey ? wallets.find((w) => w.key === walletKey) : undefined) ?? wallets[0];
  const api = await chosen.api.connect(networkId);

  const [addresses, unshielded, config] = await Promise.all([
    api.getShieldedAddresses(),
    api.getUnshieldedAddress(),
    api.getConfiguration(),
  ]);

  return {
    api,
    name: chosen.name,
    address: unshielded.unshieldedAddress || addresses.shieldedAddress,
    coinPublicKey: addresses.shieldedCoinPublicKey,
    encryptionPublicKey: addresses.shieldedEncryptionPublicKey,
    networkId: config.networkId,
    indexerUri: config.indexerUri,
    indexerWsUri: config.indexerWsUri,
    proverServerUri: config.proverServerUri,
  };
}

/** A snapshot of what the wallet holds, for the header and the funding hint. */
export interface WalletBalances {
  dust: { balance: bigint; cap: bigint };
  unshielded: Record<string, bigint>;
}

export async function readBalances(api: ConnectedAPI): Promise<WalletBalances> {
  const anyApi = api as unknown as {
    getDustBalance?(): Promise<{ balance: bigint; cap: bigint }>;
    getUnshieldedBalances?(): Promise<Record<string, bigint>>;
  };
  const [dust, unshielded] = await Promise.all([
    anyApi.getDustBalance?.().catch(() => undefined),
    anyApi.getUnshieldedBalances?.().catch(() => undefined),
  ]);
  return {
    dust: dust ?? { balance: 0n, cap: 0n },
    unshielded: unshielded ?? {},
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

/**
 * Tell the wallet which methods we are about to use. The wallet may use this to
 * prompt for permission once, instead of on every call.
 */
export async function hintWalletUsage(api: ConnectedAPI): Promise<void> {
  const anyApi = api as unknown as { hintUsage?(methods: string[]): Promise<void> };
  try {
    await anyApi.hintUsage?.(['getDustBalance', 'balanceUnsealedTransaction', 'submitTransaction']);
  } catch {
    /* hinting is best-effort */
  }
}
