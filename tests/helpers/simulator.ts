// Network-free test harness for the MedPass Compact contract. Drives the REAL
// compiled circuits from src/managed/medpass through @midnight-ntwrk/compact-runtime
// — no node, proof server or indexer. ZK proving is skipped; the JS execution of
// each circuit (asserts, ledger writes, Merkle membership checks) runs directly.
//
// RUN (standalone):
//   node --import tsx --test "tests/**/*.test.ts"
// (from medpass/). Requires the compiled artifact src/managed/medpass — run
//   npm run build:fast
// first if it is missing or the contract changed.
//
// WHAT THE SIMULATION FAITHFULLY COVERS: circuit logic, asserts, ledger writes,
// Merkle-tree membership proofs, the deterministic nullifier, and role gating.
// WHAT IT DOES NOT COVER: whether a real zswap coin exists, wallet balancing,
// DUST fees, indexer finality and ciphertext delivery — those need a preprod run.
//
// LEAF-HASHING NOTE: a Compact `MerkleTree` hashes each leaf on insert, so the
// off-chain unit tree is built by inserting the RAW commitment bytes (the runtime
// applies leafHash itself). Building it with pre-hashed leaves yields a root that
// the circuit rejects — see the "raw-leaf" assertions in the tests.

import {
  type CircuitContext,
  type CircuitResults,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  CompactTypeBytes,
  CompactTypeMerkleTreePath,
  toHex,
} from '@midnight-ntwrk/compact-runtime';
import { StateBoundedMerkleTree } from '@midnight-ntwrk/onchain-runtime-v3';
import {
  Contract,
  ledger,
  pureCircuits,
  PartyRole,
  BatchStatus,
  type Ledger,
  type Witnesses,
} from '../../src/managed/medpass/contract/index.js';

export { PartyRole, BatchStatus };
export type { Ledger };

type PS = Record<string, never>;
const PRIVATE_STATE: PS = {};
const COIN_PK = '0'.repeat(64);

// The contract declares Merkle paths as `MerkleTreePath<32, Bytes<32>>`, so both
// the party registries and each batch's unit tree are depth 32. A batch may hold
// up to 2^32 units; the demo only fills a handful.
export const UNIT_TREE_HEIGHT = 32;
export const UNITS_PER_BATCH = 1n << 32n;

const BYTES32 = new CompactTypeBytes(32);

// ---- Deterministic fixtures ------------------------------------------------------

/** A deterministic 32-byte value from a small tag. */
export function bytes32(tag: number | string): Uint8Array {
  const out = new Uint8Array(32);
  const s = String(tag);
  for (let i = 0; i < s.length && i < 32; i++) out[i] = s.charCodeAt(i);
  out[31] = typeof tag === 'number' ? tag & 0xff : s.length;
  return out;
}

function aligned(u: Uint8Array) {
  return { value: BYTES32.toValue(u), alignment: BYTES32.alignment() };
}

/**
 * Convert a 32-byte Merkle digest to the in-circuit `{ field }` form. The runtime
 * reads digest bytes as LITTLE-endian, so they must be reversed before BigInt().
 */
export function digestFromBytes(u: Uint8Array): { field: bigint } {
  const le = [...u].reverse();
  return { field: BigInt('0x' + le.map((b) => b.toString(16).padStart(2, '0')).join('')) };
}

export function digestToBytes(d: { field: bigint }): Uint8Array {
  const be = d.field.toString(16).padStart(64, '0');
  const bytes = Uint8Array.from(be.match(/../g)!.map((h) => parseInt(h, 16)));
  return bytes.reverse();
}

/** participant_id for a secret key — the same hash the contract uses. */
export function participantId(sk: Uint8Array): Uint8Array {
  return pureCircuits.participant_id(sk);
}

/** Registry leaf for a participant_id — the same hash the contract uses. */
export function partyLeaf(partyId: Uint8Array): Uint8Array {
  return pureCircuits.party_leaf(partyId);
}

export function unitCommitment(unitCode: Uint8Array): Uint8Array {
  return pureCircuits.unit_commitment(unitCode);
}

export function unitNullifier(uc: Uint8Array): Uint8Array {
  return pureCircuits.unit_nullifier(uc);
}

// ---- Off-chain unit tree ---------------------------------------------------------

export interface UnitTree {
  root: { field: bigint };
  /** Merkle path for the unit at `index`, ready to pass to `dispense`. */
  pathFor(index: number): { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] };
  codes: Uint8Array[];
}

/**
 * Build a batch's fixed-size unit tree. `codes[i]` is the raw unit code for slot i.
 * Leaves are the unit COMMITMENTS (so raw codes never reach the chain).
 */
export function buildUnitTree(codes: Uint8Array[]): UnitTree {
  if (BigInt(codes.length) > UNITS_PER_BATCH) {
    throw new Error(`batch holds at most ${UNITS_PER_BATCH} units, got ${codes.length}`);
  }
  let tree = new StateBoundedMerkleTree(UNIT_TREE_HEIGHT);
  codes.forEach((code, i) => {
    tree = tree.update(BigInt(i), aligned(unitCommitment(code)));
  });
  tree = tree.rehash();
  const rootBytes = tree.root()!.value[0] as Uint8Array;

  return {
    root: digestFromBytes(rootBytes),
    codes,
    pathFor(index: number) {
      const raw = tree.pathForLeaf(BigInt(index), aligned(unitCommitment(codes[index])));
      return new CompactTypeMerkleTreePath(UNIT_TREE_HEIGHT, BYTES32).fromValue(raw.value);
    },
  };
}

// ---- Simulator -------------------------------------------------------------------

/** A well-formed depth-32 path for a leaf that is NOT in any tree (empty siblings). */
export function placeholderPath(leaf: Uint8Array): {
  leaf: Uint8Array;
  path: { sibling: { field: bigint }; goes_left: boolean }[];
} {
  return {
    leaf,
    path: Array.from({ length: UNIT_TREE_HEIGHT }, () => ({ sibling: { field: 0n }, goes_left: true })),
  };
}

export class MedPassSim {
  readonly address: string = sampleContractAddress();
  private state: ReturnType<Contract<PS>['initialState']>['currentContractState']['data'];

  // Mutable witness values the witness closures read on each call. The harness
  // sets these before every circuit call so each call acts as the right party.
  private wCallerSk: Uint8Array = bytes32('nobody');
  private wManufacturerPath?: { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] };
  private wImporterPath?: { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] };
  private wPharmacyPath?: { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] };
  private wUnitCode?: Uint8Array;

  // Deterministic block time (unix seconds) fed to the runtime so the contract's
  // `kernel.blockTimeLessThan` checks are reproducible. Tests move it explicitly.
  private clockSeconds = 1_700_000_000;

  private constructor(state: MedPassSim['state']) {
    this.state = state;
  }

  /** Advance/rewind the simulated block clock (unix seconds). */
  setClock(seconds: number): void {
    this.clockSeconds = seconds;
  }

  get now(): number {
    return this.clockSeconds;
  }

  static deploy(regulatorKey: Uint8Array): MedPassSim {
    const sim = new MedPassSim(undefined as never);
    sim.wCallerSk = regulatorKey;
    const ctor = createConstructorContext<PS>(PRIVATE_STATE, COIN_PK);
    const res = sim.contract().initialState(ctor);
    sim.state = res.currentContractState.data;
    return sim;
  }

  get ledger(): Ledger {
    return ledger(this.state);
  }

  private witnesses(): Witnesses<PS> {
    return {
      caller_sk: ({ privateState }) => [privateState, this.wCallerSk],
      manufacturer_path: ({ privateState }) => [privateState, this.wManufacturerPath!],
      importer_path: ({ privateState }) => [privateState, this.wImporterPath!],
      pharmacy_path: ({ privateState }) => [privateState, this.wPharmacyPath!],
      unit_code: ({ privateState }) => [privateState, this.wUnitCode!],
    };
  }

  private contract(): Contract<PS> {
    return new Contract<PS>(this.witnesses());
  }

  private run<R>(
    caller: Uint8Array,
    fn: (c: Contract<PS>, ctx: CircuitContext<PS>) => CircuitResults<PS, R>,
  ): R {
    this.wCallerSk = caller;
    const ctx = createCircuitContext<PS>(
      this.address,
      COIN_PK,
      this.state,
      PRIVATE_STATE,
      undefined,
      undefined,
      this.clockSeconds,
    );
    const res = fn(this.contract(), ctx);
    this.state = res.context.currentQueryContext.state;
    return res.result;
  }

  // ---- Registry helpers ----

  /**
   * Merkle path for a party's registry leaf, read from the live on-chain tree.
   * If the party is not enrolled, return a well-formed path with the correct leaf
   * but empty siblings, so the CONTRACT's own assert fires (not a harness error).
   */
  private registryPath(
    which: 'manufacturers' | 'importers' | 'pharmacies',
    leaf: Uint8Array,
  ): { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] } {
    const found = this.ledger[which].findPathForLeaf(leaf);
    return found ? (found as never) : placeholderPath(leaf);
  }

  registryRoot(which: 'manufacturers' | 'importers' | 'pharmacies'): { field: bigint } {
    return this.ledger[which].root();
  }

  // ---- Circuits ----

  registerParty(regulatorKey: Uint8Array, role: PartyRole, partyId: Uint8Array): void {
    this.run(regulatorKey, (c, ctx) => c.impureCircuits.register_party(ctx, role, partyId));
  }

  revokeParty(regulatorKey: Uint8Array, partyId: Uint8Array): void {
    this.run(regulatorKey, (c, ctx) => c.impureCircuits.revoke_party(ctx, partyId));
  }

  createBatch(
    manufacturerKey: Uint8Array,
    batchId: Uint8Array,
    unitsRoot: { field: bigint },
    expiry: bigint,
    metadataHash: Uint8Array,
  ): void {
    const leaf = partyLeaf(participantId(manufacturerKey));
    this.wManufacturerPath = this.registryPath('manufacturers', leaf);
    const root = this.registryRoot('manufacturers');
    this.run(manufacturerKey, (c, ctx) =>
      c.impureCircuits.create_batch(ctx, batchId, root, unitsRoot, expiry, metadataHash),
    );
  }

  recordImport(
    importerKey: Uint8Array,
    batchId: Uint8Array,
    termsCommitment: Uint8Array,
  ): void {
    const leaf = partyLeaf(participantId(importerKey));
    this.wImporterPath = this.registryPath('importers', leaf);
    const root = this.registryRoot('importers');
    this.run(importerKey, (c, ctx) =>
      c.impureCircuits.record_import(ctx, batchId, root, termsCommitment),
    );
  }

  recallBatch(callerKey: Uint8Array, batchId: Uint8Array): void {
    this.run(callerKey, (c, ctx) => c.impureCircuits.recall_batch(ctx, batchId));
  }

  dispense(
    pharmacyKey: Uint8Array,
    batchId: Uint8Array,
    unitPath: { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] },
    unitCode: Uint8Array,
  ): void {
    const leaf = partyLeaf(participantId(pharmacyKey));
    this.wPharmacyPath = this.registryPath('pharmacies', leaf);
    this.wUnitCode = unitCode;
    const root = this.registryRoot('pharmacies');
    this.run(pharmacyKey, (c, ctx) =>
      c.impureCircuits.dispense(ctx, batchId, root, unitPath),
    );
  }

  /** Read-only scan: proves authenticity without consuming the unit. */
  verify(
    pharmacyKey: Uint8Array,
    batchId: Uint8Array,
    unitPath: { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] },
    unitCode: Uint8Array,
  ): void {
    const leaf = partyLeaf(participantId(pharmacyKey));
    this.wPharmacyPath = this.registryPath('pharmacies', leaf);
    this.wUnitCode = unitCode;
    const root = this.registryRoot('pharmacies');
    this.run(pharmacyKey, (c, ctx) =>
      c.impureCircuits.verify(ctx, batchId, root, unitPath),
    );
  }
}

// ---- Assertion helper: a circuit call must revert -----------------------------

/** Run `fn`; assert it throws, optionally matching a substring of the assert msg. */
export function expectRevert(fn: () => void, msgIncludes?: string): string {
  let threw = false;
  let message = '';
  try {
    fn();
  } catch (e) {
    threw = true;
    message = (e as Error).message;
  }
  if (!threw) throw new Error(`expected revert${msgIncludes ? ` (${msgIncludes})` : ''} but call succeeded`);
  if (msgIncludes && !message.includes(msgIncludes)) {
    throw new Error(`expected revert containing "${msgIncludes}" but got: ${message.split('\n')[0]}`);
  }
  return message;
}
