// Wallet + provider wiring for MedPass network runs.
//
// Mirrors the battle-tested setup from the DareU repo (midnight.ts) and
// midnight-local-dev: the testkit FluentWalletBuilder builds a WalletFacade
// (shielded + unshielded + DUST) against the configured endpoints, and the
// providers are what midnight-js-contracts needs to deploy and call circuits.
//
// Proving is REAL: the httpClientProofProvider sends each circuit to the proof
// server (default http://127.0.0.1:6300), which returns a genuine zk proof. The
// resulting transaction is balanced with DUST and submitted to the node.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type UnshieldedKeystore, type WalletFacade } from '@midnight-ntwrk/wallet-sdk';
import { FluentWalletBuilder, type DustWalletOptions } from '@midnight-ntwrk/testkit-js';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';

import { type NetworkConfig } from './network.js';

// Apollo (used by the wallet's node RPC client) needs a global WebSocket.
(globalThis as any).WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..', '..');
export const zkConfigPath = path.resolve(projectRoot, 'src', 'managed', 'medpass');
export const stateRoot = path.resolve(projectRoot, '.midnight-state');

const DUST_OPTIONS: DustWalletOptions = {
  ledgerParams: LedgerParameters.initialParameters(),
  additionalFeeOverhead: 1_000n,
  feeBlocksMargin: 5,
};

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

function envConfig(config: NetworkConfig) {
  return {
    walletNetworkId: config.id,
    networkId: config.id,
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    nodeWS: config.nodeWS,
    proofServer: config.proofServer,
    faucet: '',
  };
}

export async function buildWallet(config: NetworkConfig, mnemonic: string): Promise<WalletContext> {
  setNetworkId(config.id);
  const builder = FluentWalletBuilder.forEnvironment(envConfig(config) as any)
    .withMnemonic(mnemonic)
    .withDustOptions(DUST_OPTIONS);

  const { wallet, seeds, keystore } = await builder.buildWithoutStarting();
  const shieldedSecretKeys = ZswapSecretKeys.fromSeed(seeds.shielded);
  const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore: keystore };
}

const WAIT_MS = Number(process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS ?? 300_000);

export async function waitForUnshieldedSynced(wallet: WalletFacade, allowedGap = 50n): Promise<void> {
  await Rx.firstValueFrom(
    wallet.unshielded.state.pipe(
      Rx.filter((s) => s.progress.isCompleteWithin(allowedGap)),
      Rx.timeout({ each: WAIT_MS, with: () => Rx.throwError(() => new Error('unshielded sync timed out')) }),
    ),
  );
}

/** Register any unregistered NIGHT UTXOs for DUST and block until DUST is spendable. */
export async function ensureDust(walletCtx: WalletContext): Promise<bigint> {
  await waitForUnshieldedSynced(walletCtx.wallet);

  const unshielded = await Rx.firstValueFrom(walletCtx.wallet.unshielded.state);
  const nightUtxos = unshielded.availableCoins.filter((c: any) => !c.meta?.registeredForDustGeneration);

  if (nightUtxos.length > 0) {
    const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      walletCtx.unshieldedKeystore.getPublicKey(),
      (payload) => walletCtx.unshieldedKeystore.signData(payload),
    );
    const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
    await walletCtx.wallet.submitTransaction(finalized);
  }

  const dust = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.filter((s) => s.dust.state.progress.isCompleteWithin(50n)),
      Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      Rx.timeout({ each: WAIT_MS, with: () => Rx.throwError(() => new Error('DUST generation timed out')) }),
    ),
  );
  return dust.dust.balance(new Date());
}

/** Build the midnight-js-contracts providers backed by this wallet. */
export async function createProviders(walletCtx: WalletContext, config: NetworkConfig) {
  const state = await Rx.firstValueFrom(walletCtx.wallet.state());
  const accountId = String(walletCtx.unshieldedKeystore.getBech32Address());

  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000), tokenKindsToBalance: 'all' as any },
      );
      const signed = await walletCtx.wallet.signRecipe(recipe, (payload) =>
        walletCtx.unshieldedKeystore.signData(payload),
      );
      return walletCtx.wallet.finalizeRecipe(signed);
    },
  };

  return {
    privateStateProvider: levelPrivateStateProvider({
      accountId,
      midnightDbName: path.join(stateRoot, 'level-db'),
      privateStateStoreName: 'medpass-private-states',
      signingKeyStoreName: 'medpass-signing-keys',
      privateStoragePasswordProvider: () =>
        process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD ?? 'MedPass-Local-Dev-2026!',
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS, WebSocket as any),
    zkConfigProvider: new NodeZkConfigProvider<string>(zkConfigPath),
    proofProvider: httpClientProofProvider(config.proofServer, new NodeZkConfigProvider<string>(zkConfigPath)),
    walletProvider,
    midnightProvider: {
      submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
    },
  };
}
