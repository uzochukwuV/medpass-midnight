// Live mode: real contract calls on a Midnight network via the connected
// wallet and a prover. The wallet pays DUST fees and submits the transaction;
// proving is delegated to the wallet when it supports it, otherwise it falls
// back to an HTTP proof server.
//
// NOTE: the contract reads the acting party from the `caller_sk` WITNESS, and
// the wallet connector never reveals the wallet's secret key. This app therefore
// holds its own app identity (lib/identity.ts); the regulator enrols
// participant_id(appSecret). The wallet only pays fees and relays the tx.

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract, PartyRole, ledger } from '@medpass/contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { buildUnitTree, participantId, partyLeaf } from '@medpass/simulator';
import type { ConnectedWallet } from './wallet';
import { participantIdBytes } from './identity';
import { bytesToHex, hexToBytes, unitCodeToBytes } from './format';
import { resolveNetwork } from './network';
import type { LedgerView, Role, ScanResult } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export interface LiveContext {
  wallet: ConnectedWallet;
  contractAddress: string;
  identitySecret: Uint8Array;
  identityParticipantId: string;
  privateStatePassword: string;
}

export interface LiveSession {
  address(): string;
  deploy(): Promise<string>;
  join(address: string): Promise<void>;
  register(role: Exclude<Role, 'regulator'>, partyId: string): Promise<string>;
  revoke(partyId: string): Promise<string>;
  createBatch(batchId: string, unitCodes: string[], expiryDays: number, metadata: string): Promise<string>;
  recordImport(batchId: string, terms: string): Promise<string>;
  recall(batchId: string): Promise<string>;
  verify(batchId: string, unitCode: string): Promise<ScanResult>;
  dispense(batchId: string, unitCode: string): Promise<ScanResult>;
  readLedger(): Promise<LedgerView>;
}

const ROLE_ENUM: Record<Exclude<Role, 'regulator'>, PartyRole> = {
  manufacturer: PartyRole.MANUFACTURER,
  importer: PartyRole.IMPORTER,
  pharmacy: PartyRole.PHARMACY,
};

const ZK_PATH = `${window.location.origin}/zk/medpass`;

interface WitnessRefs {
  secret: Uint8Array;
  manufacturerPath?: unknown;
  importerPath?: unknown;
  pharmacyPath?: unknown;
  unitCode?: Uint8Array;
}

export async function createLiveSession(ctx: LiveContext): Promise<LiveSession> {
  const network = resolveNetwork(ctx.wallet.networkId || 'preprod');
  setNetworkId(network.id);

  const refs: WitnessRefs = { secret: ctx.identitySecret };
  const compiledContract = CompiledContract.make('medpass', Contract).pipe(
    CompiledContract.withWitnesses({
      caller_sk: ({ privateState }: Any) => [privateState, refs.secret],
      manufacturer_path: ({ privateState }: Any) => [privateState, refs.manufacturerPath!],
      importer_path: ({ privateState }: Any) => [privateState, refs.importerPath!],
      pharmacy_path: ({ privateState }: Any) => [privateState, refs.pharmacyPath!],
      unit_code: ({ privateState }: Any) => [privateState, refs.unitCode!],
    } as Any),
  ) as Any;

  const zkConfigProvider = new FetchZkConfigProvider(ZK_PATH, fetch.bind(window));
  const proofProvider = await buildProofProvider(ctx.wallet, zkConfigProvider, network.proofServerUri);

  const providers: Any = {
    privateStateProvider: levelPrivateStateProvider({
      accountId: ctx.wallet.address,
      privateStoragePasswordProvider: () => ctx.privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(ctx.wallet.indexerUri, ctx.wallet.indexerWsUri, WebSocket as Any),
    zkConfigProvider,
    proofProvider,
    walletProvider: {
      getCoinPublicKey: () => ctx.wallet.coinPublicKey,
      getEncryptionPublicKey: () => ctx.wallet.encryptionPublicKey,
      async balanceTx(tx: Any) {
        const res = await ctx.wallet.api.balanceUnsealedTransaction(toHex(tx.serialize()));
        return tx.constructor.deserialize('signature', 'proof', 'binding', fromHex(res.tx));
      },
    },
    midnightProvider: {
      async submitTx(tx: Any) {
        await ctx.wallet.api.submitTransaction(toHex(tx.serialize()));
        const ids = tx.identifiers?.();
        return (ids && (ids.first ?? ids[0])) || '';
      },
    },
  };

  let address = ctx.contractAddress;
  let found: Any;

  const join = async (addr: string) => {
    found = await findDeployedContract(providers, {
      contractAddress: addr,
      compiledContract,
      privateStateId: 'medpass',
      initialPrivateState: {},
    });
    address = addr;
  };

  if (address) await join(address);

  async function call(name: string, args: unknown[]): Promise<string> {
    if (!found) throw new Error('No contract session. Deploy or join a contract first.');
    const txData = await found.callTx[name](...args);
    return String(txData?.public?.txId ?? txData?.txId ?? '');
  }

  async function readState(): Promise<Any> {
    const state = await providers.publicDataProvider.queryContractState(address);
    if (!state) throw new Error('Contract state is not on the indexer yet — wait for finality and retry.');
    return ledger(state.data);
  }

  async function registryPath(kind: 'manufacturers' | 'importers' | 'pharmacies', leaf: Uint8Array) {
    const L = await readState();
    return L[kind].findPathForLeaf(leaf) ?? placeholderPath(leaf);
  }

  function myLeaf(): Uint8Array {
    return partyLeaf(participantId(ctx.identitySecret));
  }

  async function scan(batchId: string, unitCode: string, circuit: 'verify' | 'dispense', successDetail: string): Promise<ScanResult> {
    try {
      refs.pharmacyPath = await registryPath('pharmacies', myLeaf());
      refs.unitCode = unitCodeToBytes(unitCode);
      const L = await readState();
      const codes = readLocalUnitCodes(batchId);
      const tree = buildUnitTree(codes.map(unitCodeToBytes));
      const index = codes.indexOf(unitCode);
      const path = index >= 0 ? tree.pathFor(index) : placeholderPath(unitCodeToBytes(unitCode));
      await call(circuit, [unitCodeToBytes(batchId), L.pharmacies.root(), path]);
      return ok(batchId, unitCode, 'AUTHENTIC', successDetail);
    } catch (e) {
      return fail(batchId, unitCode, e);
    }
  }

  return {
    address: () => address,

    async deploy() {
      const deployed = await deployContract(providers, { compiledContract, args: [] });
      found = deployed;
      address = String(deployed.deployTxData.public.contractAddress);
      return address;
    },

    join,

    async register(role, partyId) {
      return call('register_party', [ROLE_ENUM[role], participantIdBytes(partyId)]);
    },

    revoke: (partyId) => call('revoke_party', [participantIdBytes(partyId)]),
    recall: (batchId) => call('recall_batch', [unitCodeToBytes(batchId)]),

    async recordImport(batchId, terms) {
      refs.importerPath = await registryPath('importers', myLeaf());
      const L = await readState();
      return call('record_import', [unitCodeToBytes(batchId), L.importers.root(), textTo32(terms)]);
    },

    async createBatch(batchId, unitCodes, expiryDays, metadata) {
      const tree = buildUnitTree(unitCodes.map(unitCodeToBytes));
      refs.manufacturerPath = await registryPath('manufacturers', myLeaf());
      const L = await readState();
      const expiry = BigInt(Math.floor(Date.now() / 1000) + Math.round(expiryDays * 86_400));
      const txId = await call('create_batch', [unitCodeToBytes(batchId), L.manufacturers.root(), tree.root, expiry, textTo32(metadata)]);
      rememberUnitCodes(batchId, unitCodes);
      return txId;
    },

    verify: (batchId, unitCode) =>
      scan(batchId, unitCode, 'verify', 'Manufacturer verified, imported through an authorized channel, not recalled.'),
    dispense: (batchId, unitCode) => scan(batchId, unitCode, 'dispense', 'Dispensed. The unit is now consumed on-chain.'),

    async readLedger(): Promise<LedgerView> {
      const L = await readState();
      return {
        batchCount: Number(L.batch_count),
        partyCount: Number(L.party_count),
        manufacturers: [],
        importers: [],
        pharmacies: [],
        batches: [],
        dispensed: [],
        revoked: [],
      };
    },
  };
}

// ---- proof provider selection ----

async function buildProofProvider(wallet: ConnectedWallet, zkConfigProvider: unknown, proofServerUri: string) {
  const api = wallet.api as Any;
  if (typeof api.getProvingProvider === 'function') {
    try {
      const mod = await import('@midnight-ntwrk/midnight-js-dapp-connector-proof-provider');
      const provider = await (mod as Any).dappConnectorProofProvider(api, zkConfigProvider);
      if (provider) return provider;
    } catch {
      /* fall through to the HTTP proof server */
    }
  }
  return httpClientProofProvider(proofServerUri, zkConfigProvider as Any);
}

// ---- small utilities ----

export function rememberUnitCodes(batchId: string, codes: string[]): void {
  try {
    localStorage.setItem(`medpass.units.${batchId}`, JSON.stringify(codes));
  } catch {
    /* storage full or blocked — the manufacturer's unit sheet is the source of truth */
  }
}

function readLocalUnitCodes(batchId: string): string[] {
  try {
    const raw = localStorage.getItem(`medpass.units.${batchId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

function fromHex(hex: string): Uint8Array {
  return hexToBytes(hex);
}

function textTo32(text: string): Uint8Array {
  const out = new Uint8Array(32);
  const s = text.slice(0, 32);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function placeholderPath(leaf: Uint8Array) {
  return { leaf, path: Array.from({ length: 32 }, () => ({ sibling: { field: 0n }, goes_left: true })) };
}

function ok(batchId: string, unitCode: string, outcome: ScanResult['outcome'], detail: string): ScanResult {
  return { pharmacy: 'wallet', batchId, unitCode, outcome, detail, at: Date.now() };
}

function fail(batchId: string, unitCode: string, e: unknown): ScanResult {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const map: Array<[string, ScanResult['outcome'], string]> = [
    ['already dispensed', 'CLONE', 'This unit was already dispensed — a copy of its passport is in circulation.'],
    ['recalled', 'RECALLED', 'The regulator recalled this batch. Do not dispense.'],
    ['expired', 'EXPIRED', 'The batch is past its expiry window.'],
    ['not imported', 'NOT_IMPORTED', 'No authorized import was recorded for this batch.'],
    ['part of this batch', 'NOT_IN_BATCH', 'This unit code is not enrolled in the stated batch.'],
    ['revoked', 'REVOKED', 'The scanning pharmacy is not in good standing.'],
    ['not registered', 'NOT_A_PHARMACY', 'The scanning pharmacy is not enrolled in the registry.'],
    ['no such batch', 'UNKNOWN', 'No such batch exists on-chain.'],
  ];
  for (const [needle, outcome, detail] of map) {
    if (m.includes(needle)) return { pharmacy: 'wallet', batchId, unitCode, outcome, detail, at: Date.now() };
  }
  return { pharmacy: 'wallet', batchId, unitCode, outcome: 'UNKNOWN', detail: e instanceof Error ? e.message : String(e), at: Date.now() };
}
