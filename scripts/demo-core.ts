// End-to-end MedPass walkthrough. Runs the REAL compiled circuits (no node,
// indexer or proof server) and records what a verifier sees on-chain next to
// what each party keeps private. Shared by the CLI demo and the web demo.

import { toHex } from '@midnight-ntwrk/compact-runtime';
import {
  MedPassSim,
  PartyRole,
  BatchStatus,
  bytes32,
  participantId,
  unitCommitment,
  unitNullifier,
  buildUnitTree,
  digestToBytes,
  type UnitTree,
} from '../tests/helpers/simulator.js';

export type ScanOutcome =
  | 'AUTHENTIC'
  | 'RECALLED'
  | 'EXPIRED'
  | 'CLONE'
  | 'NOT_IMPORTED'
  | 'NOT_IN_BATCH'
  | 'UNKNOWN'
  | 'REVOKED'
  | 'NOT_A_PHARMACY';

export interface ScanResult {
  pharmacy: string;
  batchId: string;
  unit: number;
  outcome: ScanOutcome;
  detail: string;
  nullifier?: string;
}

export interface BatchView {
  id: string;
  manufacturer: string;
  status: 'ACTIVE' | 'RECALLED';
  expiry: number;
  unitsRoot: string;
  metadataHash: string;
  imported: boolean;
  termsCommitment?: string;
}

export interface DemoState {
  regulator: { label: string; id: string };
  registries: { manufacturers: string[]; importers: string[]; pharmacies: string[] };
  batches: BatchView[];
  dispensed: string[];
  scans: ScanResult[];
  privacy: { onChain: string[]; private: string[] };
  counts: { batches: number; parties: number };
}

const hex = (u: Uint8Array) => toHex(u);

/** A field value as 32 big-endian hex bytes (matches the Merkle-root byte form). */
const fieldHex = (f: bigint) => toHex(digestToBytes({ field: f }));

class MedPassDemo {
  readonly sim: MedPassSim;
  readonly scans: ScanResult[] = [];

  private readonly keys = {
    regulator: bytes32('regulator-key'),
    manufacturer: bytes32('acme-pharma-key'),
    importer: bytes32('globalmed-imports-key'),
    pharmacyA: bytes32('citycare-pharmacy-key'),
    pharmacyB: bytes32('ruralhealth-pharmacy-key'),
    outsider: bytes32('unregistered-pharmacy-key'),
  };

  constructor() {
    this.sim = MedPassSim.deploy(this.keys.regulator);
  }

  /** Enroll the demo's parties, then create/import a first batch. */
  bootstrap() {
    this.sim.registerParty(this.keys.regulator, PartyRole.MANUFACTURER, participantId(this.keys.manufacturer));
    this.sim.registerParty(this.keys.regulator, PartyRole.IMPORTER, participantId(this.keys.importer));
    this.sim.registerParty(this.keys.regulator, PartyRole.PHARMACY, participantId(this.keys.pharmacyA));
    this.sim.registerParty(this.keys.regulator, PartyRole.PHARMACY, participantId(this.keys.pharmacyB));
  }

  createBatch(
    label: string,
    units: number,
    opts: { import?: boolean; recall?: boolean; expiry?: bigint } = {},
  ) {
    const codes = Array.from({ length: units }, (_, i) => bytes32(`${label}-unit-${i}`));
    const tree = buildUnitTree(codes);
    const batchId = bytes32(label);
    const expiry = opts.expiry ?? 2000000000n;
    this.sim.createBatch(this.keys.manufacturer, batchId, tree.root, expiry, bytes32(`${label}-meta`));
    if (opts.import !== false) {
      this.sim.recordImport(this.keys.importer, batchId, bytes32(`${label}-terms-commitment`));
    }
    if (opts.recall) this.sim.recallBatch(this.keys.regulator, batchId);
    return { batchId, tree, codes };
  }

  /** Regulator strikes a party off; its proofs stop working. */
  revoke(party: keyof MedPassDemo['keys']) {
    this.sim.revokeParty(this.keys.regulator, participantId(this.keys[party]));
  }

  /** Run a pharmacy scan and classify the outcome the way a UI would. */
  scan(
    pharmacy: keyof MedPassDemo['keys'],
    pharmacyLabel: string,
    batchLabel: string,
    tree: UnitTree,
    unit: number,
  ): ScanResult {
    const batchId = bytes32(batchLabel);
    let outcome: ScanOutcome;
    let detail: string;
    try {
      this.sim.verify(this.keys[pharmacy], batchId, tree.pathFor(unit), tree.codes[unit]);
      outcome = 'AUTHENTIC';
      detail = 'Manufacturer registered, imported via an authorized channel, not recalled.';
    } catch (e) {
      detail = (e as Error).message.split('\n')[0];
      outcome = classify(detail);
    }
    const result: ScanResult = {
      pharmacy: pharmacyLabel,
      batchId: batchLabel,
      unit,
      outcome,
      detail,
    };
    if (outcome === 'AUTHENTIC') {
      result.nullifier = hex(unitNullifier(unitCommitment(tree.codes[unit])));
    }
    this.scans.push(result);
    return result;
  }

  /** Point-of-sale scan: same checks, plus burns the nullifier. */
  dispense(
    pharmacy: keyof MedPassDemo['keys'],
    pharmacyLabel: string,
    batchLabel: string,
    tree: UnitTree,
    unit: number,
  ): ScanResult {
    const batchId = bytes32(batchLabel);
    let outcome: ScanOutcome;
    let detail: string;
    try {
      this.sim.dispense(this.keys[pharmacy], batchId, tree.pathFor(unit), tree.codes[unit]);
      outcome = 'AUTHENTIC';
      detail = 'Dispensed: authenticity proven and the unit nullifier was burned.';
    } catch (e) {
      detail = (e as Error).message.split('\n')[0];
      outcome = classify(detail);
    }
    const result: ScanResult = {
      pharmacy: pharmacyLabel,
      batchId: batchLabel,
      unit,
      outcome,
      detail,
      nullifier: hex(unitNullifier(unitCommitment(tree.codes[unit]))),
    };
    this.scans.push(result);
    return result;
  }

  snapshot(): DemoState {
    const L = this.sim.ledger;
    const batches: BatchView[] = [];
    // The demo only knows a handful of batch ids; read them back by label.
    for (const label of this.batchLabels) {
      const id = bytes32(label);
      if (!L.batches.member(id)) continue;
      const rec = L.batches.lookup(id);
      const permit = L.imports.member(id) ? L.imports.lookup(id) : undefined;
      batches.push({
        id: label,
        manufacturer: hex(rec.manufacturer),
        status: rec.status === BatchStatus.RECALLED ? 'RECALLED' : 'ACTIVE',
        expiry: Number(rec.expiry),
        unitsRoot: hex(digestToBytes(rec.units_root)),
        metadataHash: hex(rec.metadata_hash),
        imported: !!permit,
        termsCommitment: permit ? hex(permit.terms_commitment) : undefined,
      });
    }

    const dispensed: string[] = [];
    for (const s of this.scans) if (s.nullifier && s.outcome === 'AUTHENTIC') dispensed.push(s.nullifier);

    return {
      regulator: { label: 'Regulator (sealed)', id: hex(L.regulator) },
      registries: {
        manufacturers: [fieldHex(L.manufacturers.root().field)],
        importers: [fieldHex(L.importers.root().field)],
        pharmacies: [fieldHex(L.pharmacies.root().field)],
      },
      batches,
      dispensed,
      scans: this.scans,
      privacy: {
        onChain: [
          'batch ids, manufacturer ids, expiry, unit-tree roots, metadata commitments',
          'whether each batch was imported (and an opaque terms commitment)',
          'whether each batch is recalled',
          'the set of dispensed-unit nullifiers (one-way, unlinkable)',
          'the three party-registry Merkle roots, and a revoked-leaf set',
        ],
        private: [
          'importer identity for each import',
          'pharmacy identity for each dispense',
          'supplier contract terms and pricing',
          'which pharmacy dispensed which unit',
          'raw unit codes (only commitments are on-chain)',
        ],
      },
      counts: { batches: Number(L.batch_count), parties: Number(L.party_count) },
    };
  }

  private readonly batchLabels: string[] = [];
  trackBatch(label: string) {
    this.batchLabels.push(label);
  }
}

function classify(msg: string): ScanOutcome {
  if (msg.includes('Batch is recalled')) return 'RECALLED';
  if (msg.includes('Batch has expired')) return 'EXPIRED';
  if (msg.includes('is revoked')) return 'REVOKED';
  if (msg.includes('already dispensed')) return 'CLONE';
  if (msg.includes('not imported')) return 'NOT_IMPORTED';
  if (msg.includes('not part of this batch')) return 'NOT_IN_BATCH';
  if (msg.includes('Pharmacy not registered')) return 'NOT_A_PHARMACY';
  if (msg.includes('Unknown batch')) return 'UNKNOWN';
  return 'UNKNOWN';
}

/** Run the full narrated lifecycle and return the resulting view state. */
export function runDemo(): DemoState {
  const d = new MedPassDemo();
  d.bootstrap();

  // Batch 1: genuine, imported, dispensed once, then a clone attempt.
  d.trackBatch('MP-2026-001');
  const good = d.createBatch('MP-2026-001', 8);
  d.scan('pharmacyA', 'CityCare Pharmacy', 'MP-2026-001', good.tree, 0); // pre-sale scan
  d.dispense('pharmacyA', 'CityCare Pharmacy', 'MP-2026-001', good.tree, 0);
  d.dispense('pharmacyB', 'RuralHealth Pharmacy', 'MP-2026-001', good.tree, 0); // clone

  // Batch 2: recalled after manufacturing.
  d.trackBatch('MP-2026-002');
  const recalled = d.createBatch('MP-2026-002', 4, { recall: true });
  d.scan('pharmacyA', 'CityCare Pharmacy', 'MP-2026-002', recalled.tree, 0);

  // Batch 3: manufactured but never imported through an authorized channel.
  d.trackBatch('MP-2026-003');
  const grey = d.createBatch('MP-2026-003', 4, { import: false });
  d.scan('pharmacyA', 'CityCare Pharmacy', 'MP-2026-003', grey.tree, 0);

  // A unit that does not belong to the batch it claims (wrong-batch QR).
  const foreign = buildUnitTree([bytes32('foreign-unit-0')]);
  d.scan('pharmacyA', 'CityCare Pharmacy', 'MP-2026-001', foreign, 0);

  // Batch 4: a genuine batch that has passed its expiry.
  d.trackBatch('MP-2026-004');
  const expired = d.createBatch('MP-2026-004', 4, { expiry: 1_700_000_100n });
  d.sim.setClock(1_700_000_200); // now past that expiry
  d.scan('pharmacyA', 'CityCare Pharmacy', 'MP-2026-004', expired.tree, 0);

  // Batch 5: a pharmacy that has just lost its licence is revoked.
  d.trackBatch('MP-2026-005');
  const licensed = d.createBatch('MP-2026-005', 4);
  d.scan('pharmacyB', 'RuralHealth Pharmacy', 'MP-2026-005', licensed.tree, 0); // ok
  d.revoke('pharmacyB');
  d.scan('pharmacyB', 'RuralHealth Pharmacy', 'MP-2026-005', licensed.tree, 1); // now REVOKED

  return d.snapshot();
}
