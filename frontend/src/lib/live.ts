// Live mode: real contract calls on a Midnight network via the connected
// wallet. The wallet pays DUST fees, balances and submits the transaction;
// proving is delegated to the wallet when it exposes a proving provider and
// otherwise falls back to an HTTP proof server.
//
// The provider wiring mirrors Midnight's own browser example
// (https://github.com/midnightntwrk/example-bboard): an in-memory private-state
// provider (classic-level cannot run in a browser), FetchZkConfigProvider over
// the app's own /zk/medpass artifacts, and the indexer for public state.
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
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { buildUnitTree, participantId, partyLeaf } from '@medpass/simulator';
import type { ConnectedWallet } from './wallet';
import { inMemoryPrivateStateProvider } from './private-state';
import { participantIdBytes } from './identity';
import { bytesToHex, hexToBytes, unitCodeFromBytes, unitCodeToBytes } from './format';
import { resolveNetwork } from './network';
import type { BatchView, LedgerView, Role, ScanResult, TxStage } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export interface LiveContext {
  wallet: ConnectedWallet;
  contractAddress: string;
  identitySecret: Uint8Array;
  identityParticipantId: string;
  /** Called as the transaction moves through its stages. */
  onStage?: (stage: TxStage) => void;
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
  /** Self-check: is this session's own leaf in `role`'s registry, and revoked? */
  enrollmentStatus(role: Exclude<Role, 'regulator'>): Promise<{ enrolled: boolean; revoked: boolean }>;
}

const ROLE_ENUM: Record<Exclude<Role, 'regulator'>, PartyRole> = {
  manufacturer: PartyRole.MANUFACTURER,
  importer: PartyRole.IMPORTER,
  pharmacy: PartyRole.PHARMACY,
};

/** Ledger field per registry. Spelled out because `${role}s` yields "pharmacys". */
const REGISTRY: Record<Exclude<Role, 'regulator'>, 'manufacturers' | 'importers' | 'pharmacies'> = {
  manufacturer: 'manufacturers',
  importer: 'importers',
  pharmacy: 'pharmacies',
};

const PARTY_STATE_ID = 'medpass';

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

  const stage = (s: TxStage) => ctx.onStage?.(s);

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

  // FetchZkConfigProvider requests `${base}/keys/<circuit>.prover` and
  // `${base}/zkir/<circuit>.bzkir`; the vite plugin serves src/managed/medpass
  // at exactly that path (dev) and copies it into dist (build).
  const zkConfigProvider = new FetchZkConfigProvider(`${window.location.origin}/zk/medpass`, fetch.bind(window));

  const privateStateProvider = inMemoryPrivateStateProvider<string, Any>();
  const proofProvider = await buildProofProvider(ctx.wallet, zkConfigProvider, network.proofServerUri);

  const providers: Any = {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(ctx.wallet.indexerUri, ctx.wallet.indexerWsUri, WebSocket as Any),
    zkConfigProvider,
    proofProvider,
    walletProvider: {
      getCoinPublicKey: () => ctx.wallet.coinPublicKey,
      getEncryptionPublicKey: () => ctx.wallet.encryptionPublicKey,
      async balanceTx(tx: Any) {
        stage('balancing');
        const res = await ctx.wallet.api.balanceUnsealedTransaction(toHex(tx.serialize()));
        return tx.constructor.deserialize('signature', 'proof', 'binding', fromHex(res.tx));
      },
    },
    midnightProvider: {
      async submitTx(tx: Any) {
        stage('submitting');
        await ctx.wallet.api.submitTransaction(toHex(tx.serialize()));
        const ids = tx.identifiers?.();
        return (ids && (ids.first ?? ids[0])) || '';
      },
    },
  };

  let address = ctx.contractAddress;
  let found: Any;

  const join = async (addr: string) => {
    // The provider scopes private state by contract address; midnight-js calls
    // this itself on deploy, but a join needs it up front.
    privateStateProvider.setContractAddress(addr as Any);
    found = await findDeployedContract(providers, {
      contractAddress: addr,
      compiledContract,
      privateStateId: PARTY_STATE_ID,
      initialPrivateState: {},
    });
    address = addr;
  };

  if (address) await join(address);

  async function call(name: string, args: unknown[]): Promise<string> {
    if (!found) throw new Error('No contract session. Deploy or join a contract first.');
    stage('building');
    const txData = await found.callTx[name](...args);
    stage('finalized');
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

  async function scan(
    batchId: string,
    unitCode: string,
    circuit: 'verify' | 'dispense',
    successDetail: string,
  ): Promise<ScanResult> {
    try {
      refs.pharmacyPath = await registryPath('pharmacies', myLeaf());
      refs.unitCode = unitCodeToBytes(unitCode);
      const L = await readState();
      // The unit's Merkle path is private state the scanning party supplies. The
      // manufacturer's unit sheet is the source of truth; when this browser does
      // not hold it (a different device scanning the pack), fall back to a
      // well-formed placeholder, which the circuit rejects as NOT_IN_BATCH.
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
      privateStateProvider.setContractAddress(address as Any);
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
      const txId = await call('create_batch', [
        unitCodeToBytes(batchId),
        L.manufacturers.root(),
        tree.root,
        expiry,
        textTo32(metadata),
      ]);
      rememberUnitCodes(batchId, unitCodes);
      return txId;
    },

    verify: (batchId, unitCode) =>
      scan(batchId, unitCode, 'verify', 'Manufacturer verified, imported through an authorized channel, not recalled.'),
    dispense: (batchId, unitCode) => scan(batchId, unitCode, 'dispense', 'Dispensed. The unit is now consumed on-chain.'),

    // The ledger is read back from the indexer, so the UI shows the real
    // on-chain state rather than a local mirror.
    async readLedger(): Promise<LedgerView> {
      const L = await readState();

      const batches: BatchView[] = [];
      for (const [key, rec] of iterateEntries(L.batches)) {
        const id = unitCodeFromBytes(key);
        const imported = L.imports.member(key);
        const permit = imported ? L.imports.lookup(key) : undefined;
        batches.push({
          id,
          manufacturer: bytesToHex(rec.manufacturer),
          status: Number(rec.status) === 1 ? 'RECALLED' : 'ACTIVE',
          expiry: Number(rec.expiry),
          unitsRoot: bytesToHex(digestToBytes(rec.units_root)),
          metadataHash: bytesToHex(rec.metadata_hash),
          imported,
          termsCommitment: permit ? bytesToHex(permit.terms_commitment) : undefined,
          unitCount: readLocalUnitCodes(id).length,
        });
      }

      const dispensed = iterateValues(L.dispensed).map((v) => bytesToHex(v));
      const revoked = iterateValues(L.revoked).map((v) => bytesToHex(v));

      return {
        batchCount: Number(L.batch_count),
        partyCount: Number(L.party_count),
        batches,
        dispensed,
        revoked,
      };
    },

    // A party may learn its OWN enrolment status, and nothing else. The
    // registry is a Merkle tree of leaf commitments: we derive our own leaf,
    // ask the indexer for a membership path for it, and check the revoked set.
    // This cannot enumerate any other party.
    async enrollmentStatus(role: Exclude<Role, 'regulator'>) {
      const L = await readState();
      const leaf = myLeaf();
      const registry = L[REGISTRY[role]];
      const path = registry?.findPathForLeaf?.(leaf);
      const enrolled = !!path;
      const revoked = !!L.revoked?.member?.(leaf);
      return { enrolled, revoked };
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

// ---- ledger iteration ----

function iterateEntries(map: Any): Array<[Uint8Array, Any]> {
  if (!map || typeof map[Symbol.iterator] !== 'function') return [];
  return [...map] as Array<[Uint8Array, Any]>;
}

function iterateValues(set: Any): Uint8Array[] {
  if (!set || typeof set[Symbol.iterator] !== 'function') return [];
  return [...set] as Uint8Array[];
}

function digestToBytes(d: { field: bigint }): Uint8Array {
  let v = d.field;
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
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

/** Unit codes this browser holds for a batch — the source for the QR sheet. */
export function localUnitCodes(batchId: string): string[] {
  return readLocalUnitCodes(batchId);
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
    ['unknown batch', 'UNKNOWN', 'No such batch exists on-chain.'],
  ];
  for (const [needle, outcome, detail] of map) {
    if (m.includes(needle)) return { pharmacy: 'wallet', batchId, unitCode, outcome, detail, at: Date.now() };
  }
  return {
    pharmacy: 'wallet',
    batchId,
    unitCode,
    outcome: 'UNKNOWN',
    detail: e instanceof Error ? e.message : String(e),
    at: Date.now(),
  };
}
