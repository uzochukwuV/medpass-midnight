// Wallet + provider wiring for MedPass network runs.
//
// The wallet facade is assembled by hand (rather than via the testkit
// FluentWalletBuilder) for two reasons:
//
//  1. DUST sync speed. The dust wallet replays every DUST ledger event from
//     genesis. The SDK default batches 10 events every 4 ms, which caps replay
//     at ~120 events/s — roughly 4 hours on preprod. A large batch with no
//     spacing lifts that to ~650 events/s.
//  2. Resumable sync. The dust wallet state is serialized to a gitignored file
//     periodically, so a restart resumes from the last applied index instead of
//     replaying from the beginning.
//
// Proving is REAL: httpClientProofProvider sends each circuit to the proof
// server (default http://127.0.0.1:6300), which returns a genuine zk proof. The
// resulting transaction is balanced with DUST and submitted to the node.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { DustSecretKey, LedgerParameters, ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  DustWallet,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  ShieldedWallet,
  UnshieldedWallet,
  WalletEntrySchema,
  WalletFacade,
  createKeystore,
  mergeWalletEntries,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk';
import { WalletSeeds } from '@midnight-ntwrk/testkit-js';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';

import { type NetworkConfig } from './network.js';

// Apollo (used by the wallet's node RPC client) needs a global WebSocket.
(globalThis as any).WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..', '..');
export const zkConfigPath = path.resolve(projectRoot, 'src', 'managed', 'medpass');
export const stateRoot = path.resolve(projectRoot, '.midnight-state');

const DUST_OPTIONS = {
  ledgerParams: LedgerParameters.initialParameters(),
  additionalFeeOverhead: 1_000n,
  feeBlocksMargin: 5,
};

// Events per sync batch, and spacing between batches. The SDK defaults (10
// events / 4 ms spacing) are far too small for a from-genesis DUST replay on a
// public network.
const SYNC_BATCH = {
  size: Number(process.env.MIDNIGHT_SYNC_BATCH_SIZE ?? 5_000),
  timeout: 1,
  spacing: Number(process.env.MIDNIGHT_SYNC_SPACING_MS ?? 0),
};

export interface WalletContext {
  config: NetworkConfig;
  wallet: WalletFacade;
  shieldedSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

function walletConfig(config: NetworkConfig) {
  return {
    networkId: config.id,
    costParameters: { ...DUST_OPTIONS },
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
      keepAlive: 30_000,
    },
    batchUpdates: SYNC_BATCH,
    relayURL: new URL(config.nodeWS),
    provingServerUrl: new URL(config.proofServer),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  };
}

/** Path of the persisted DUST sync checkpoint for a network. */
export function dustStatePath(config: NetworkConfig): string {
  return path.join(stateRoot, `wallet-${config.id}-dust.json`);
}

function makeDustWallet(config: NetworkConfig, dustSeed: Uint8Array) {
  const factory = DustWallet(walletConfig(config) as any);
  const file = dustStatePath(config);
  if (fs.existsSync(file)) {
    try {
      return factory.restore(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(`  ignoring unreadable DUST checkpoint (${file}): ${(err as Error).message}`);
    }
  }
  return factory.startWithSeed(dustSeed, DUST_OPTIONS.ledgerParams.dust);
}

export async function buildWallet(config: NetworkConfig, mnemonic: string): Promise<WalletContext> {
  setNetworkId(config.id);
  const seeds = WalletSeeds.fromMnemonic(mnemonic);
  const unshieldedKeystore = createKeystore(seeds.unshielded, config.id as any);
  const wConfig = walletConfig(config);

  const shieldedWallet = ShieldedWallet(wConfig as any).startWithSeed(seeds.shielded);
  const unshieldedWallet = UnshieldedWallet(wConfig as any).startWithPublicKey(
    PublicKey.fromKeyStore(unshieldedKeystore),
  );
  const dustWallet = makeDustWallet(config, seeds.dust);

  const wallet = await WalletFacade.init({
    configuration: wConfig as any,
    shielded: () => shieldedWallet,
    unshielded: () => unshieldedWallet,
    dust: () => dustWallet,
  });

  const shieldedSecretKeys = ZswapSecretKeys.fromSeed(seeds.shielded);
  const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { config, wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

/** Persist the DUST sync checkpoint so the next run resumes instead of replaying. */
export async function saveDustState(walletCtx: WalletContext): Promise<void> {
  const serialized = await walletCtx.wallet.dust.serializeState();
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(dustStatePath(walletCtx.config), serialized, { mode: 0o600 });
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

  let registrationError: unknown;
  if (nightUtxos.length > 0) {
    try {
      const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
        nightUtxos,
        walletCtx.unshieldedKeystore.getPublicKey(),
        (payload) => walletCtx.unshieldedKeystore.signData(payload),
      );
      const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
      await walletCtx.wallet.submitTransaction(finalized);
    } catch (err) {
      // A registration is rejected as invalid (Custom error 173) when the node
      // already has the coin registered but the indexer has not caught up, so
      // the wallet still reports it as unregistered. That is benign: keep the
      // error only to explain a DUST timeout, and wait for DUST below.
      registrationError = err;
    }
  }

  // Persist the checkpoint periodically while DUST generation is awaited, so a
  // restart resumes near the tip instead of replaying the whole ledger.
  const checkpoint = setInterval(() => void saveDustState(walletCtx).catch(() => {}), 60_000);
  try {
    const dust = await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.filter((s) => s.dust.state.progress.isCompleteWithin(50n)),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
        Rx.timeout({
          each: WAIT_MS,
          with: () =>
            Rx.throwError(
              () =>
                new Error(
                  'DUST generation timed out' +
                    (registrationError ? ` (registration was rejected: ${String(registrationError)})` : ''),
                ),
            ),
        }),
      ),
    );
    return dust.dust.balance(new Date());
  } finally {
    clearInterval(checkpoint);
    await saveDustState(walletCtx).catch(() => {});
  }
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
