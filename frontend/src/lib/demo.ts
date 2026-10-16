// Demo engine: drives the REAL compiled MedPass circuits in the browser through
// the network-free simulator (no node, indexer or proof server). It mirrors the
// contract's checks so the UI can present the same verdicts a live scan returns,
// and it is what powers demo mode. Live mode (lib/live.ts) swaps this for the
// wallet + proof-server path with the same interface.

import {
  MedPassSim,
  PartyRole,
  buildUnitTree,
  digestToBytes,
  participantId,
  partyLeaf,
  unitCommitment,
  unitNullifier,
  type UnitTree,
} from '@medpass/simulator';
import { bytesToHex, unitCodeToBytes } from './format';
import { PERSONAS } from './personas';
import type { BatchView, LedgerView, Party, Role, ScanOutcome, ScanResult } from './types';

interface DemoBatch {
  view: BatchView;
  tree: UnitTree;
  codes: string[];
}

const ROLE_FOR: Record<Role, PartyRole> = {
  regulator: PartyRole.MANUFACTURER, // unused; regulator is the sealed root
  manufacturer: PartyRole.MANUFACTURER,
  importer: PartyRole.IMPORTER,
  pharmacy: PartyRole.PHARMACY,
};

/** Map a circuit revert message to a user-facing scan outcome. */
function outcomeFromError(message: string): { outcome: ScanOutcome; detail: string } {
  const m = message.toLowerCase();
  if (m.includes('already dispensed')) return { outcome: 'CLONE', detail: 'This unit was already dispensed — a copy of its passport is in circulation.' };
  if (m.includes('recalled')) return { outcome: 'RECALLED', detail: 'The regulator recalled this batch. Do not dispense.' };
  if (m.includes('expired')) return { outcome: 'EXPIRED', detail: 'The batch is past its expiry window.' };
  if (m.includes('not imported') || m.includes('authorized channel')) return { outcome: 'NOT_IMPORTED', detail: 'No authorized import was recorded for this batch.' };
  if (m.includes('not part of this batch') || m.includes('does not match')) return { outcome: 'NOT_IN_BATCH', detail: 'This unit code is not enrolled in the stated batch.' };
  if (m.includes('revoked')) return { outcome: 'REVOKED', detail: 'The scanning pharmacy is not in good standing.' };
  if (m.includes('not registered')) return { outcome: 'NOT_A_PHARMACY', detail: 'The scanning pharmacy is not enrolled in the registry.' };
  if (m.includes('unknown batch') || m.includes('no such batch')) return { outcome: 'UNKNOWN', detail: 'No such batch exists on-chain.' };
  return { outcome: 'UNKNOWN', detail: message };
}

export class DemoEngine {
  readonly sim: MedPassSim;
  private readonly batches = new Map<string, DemoBatch>();
  private readonly revokedLeaves = new Set<string>();
  private readonly dispensedNullifiers = new Set<string>();

  private constructor(sim: MedPassSim) {
    this.sim = sim;
  }

  static create(): DemoEngine {
    const engine = new DemoEngine(MedPassSim.deploy(hexToKey(PERSONAS.regulator.secretKey)));
    engine.sim.setClock(Math.floor(Date.now() / 1000));
    engine.seed();
    return engine;
  }

  private key(id: string): Uint8Array {
    return hexToKey(PERSONAS[id].secretKey);
  }

  private seed(): void {
    // Registry: one manufacturer, one importer, two pharmacies.
    this.register('acme');
    this.register('globalmed');
    this.register('citycare');
    this.register('ruralhealth');

    // Batch 1 — the happy path, imported, 4 units.
    this.createBatch('AMX-2026-01', 'acme', ['AMX-2026-01-0001', 'AMX-2026-01-0002', 'AMX-2026-01-0003', 'AMX-2026-01-0004'], 365, 'meta:amoxicillin-500mg');
    this.recordImport('AMX-2026-01', 'globalmed', 'terms:globalmed-2026');

    // Batch 2 — created but never imported, to demonstrate NOT_IMPORTED.
    this.createBatch('NXR-2026-07', 'acme', ['NXR-2026-07-0001', 'NXR-2026-07-0002'], 365, 'meta:nexorole-20mg');
  }

  // ---- write actions ----

  register(id: string): void {
    const p = PERSONAS[id];
    if (p.role === 'regulator') return;
    this.sim.registerParty(this.key('regulator'), ROLE_FOR[p.role], participantId(this.key(id)));
  }

  revoke(id: string): void {
    const leaf = partyLeaf(participantId(this.key(id)));
    this.sim.revokeParty(this.key('regulator'), participantId(this.key(id)));
    this.revokedLeaves.add(bytesToHex(leaf));
  }

  reRegister(id: string): void {
    this.register(id);
    this.revokedLeaves.delete(bytesToHex(partyLeaf(participantId(this.key(id)))));
  }

  createBatch(batchId: string, manufacturerId: string, unitCodes: string[], expiryDays: number, metadata: string): void {
    const codes = unitCodes.map(unitCodeToBytes);
    const tree = buildUnitTree(codes);
    const expiry = BigInt(this.sim.now + Math.round(expiryDays * 86_400));
    this.sim.createBatch(this.key(manufacturerId), unitCodeToBytes(batchId), tree.root, expiry, textTo32(metadata));
    this.batches.set(batchId, {
      tree,
      codes: unitCodes,
      view: {
        id: batchId,
        manufacturer: PERSONAS[manufacturerId].label,
        status: 'ACTIVE',
        expiry: Number(expiry),
        unitsRoot: bytesToHex(digestToBytes(tree.root)),
        metadataHash: bytesToHex(textTo32(metadata)),
        imported: false,
        unitCount: unitCodes.length,
      },
    });
  }

  recordImport(batchId: string, importerId: string, terms: string): void {
    this.sim.recordImport(this.key(importerId), unitCodeToBytes(batchId), textTo32(terms));
    const b = this.batches.get(batchId);
    if (b) {
      b.view.imported = true;
      b.view.importedBy = PERSONAS[importerId].label;
      b.view.termsCommitment = bytesToHex(textTo32(terms));
    }
  }

  recall(batchId: string): void {
    this.sim.recallBatch(this.key('regulator'), unitCodeToBytes(batchId));
    const b = this.batches.get(batchId);
    if (b) b.view.status = 'RECALLED';
  }

  /** Demo-only: move the simulated block clock so expiry can be shown. */
  advanceClock(seconds: number): void {
    this.sim.setClock(this.sim.now + seconds);
  }

  // ---- scan actions (the pharmacy flow) ----

  verify(pharmacyId: string, batchId: string, unitCode: string): ScanResult {
    const b = this.batches.get(batchId);
    const index = b?.codes.indexOf(unitCode) ?? -1;
    const path = index >= 0 ? b!.tree.pathFor(index) : placeholderPath(unitCodeToBytes(unitCode));
    try {
      this.sim.verify(this.key(pharmacyId), unitCodeToBytes(batchId), path, unitCodeToBytes(unitCode));
      return this.result(pharmacyId, batchId, unitCode, 'AUTHENTIC', 'Manufacturer verified, imported through an authorized channel, not recalled.');
    } catch (e) {
      const { outcome, detail } = outcomeFromError(errMsg(e));
      return this.result(pharmacyId, batchId, unitCode, outcome, detail);
    }
  }

  dispense(pharmacyId: string, batchId: string, unitCode: string): ScanResult {
    const b = this.batches.get(batchId);
    const index = b?.codes.indexOf(unitCode) ?? -1;
    const path = index >= 0 ? b!.tree.pathFor(index) : placeholderPath(unitCodeToBytes(unitCode));
    try {
      this.sim.dispense(this.key(pharmacyId), unitCodeToBytes(batchId), path, unitCodeToBytes(unitCode));
      const nul = bytesToHex(unitNullifier(unitCommitment(unitCodeToBytes(unitCode))));
      this.dispensedNullifiers.add(nul);
      return { ...this.result(pharmacyId, batchId, unitCode, 'AUTHENTIC', 'Dispensed. The unit is now consumed on-chain.'), nullifier: nul };
    } catch (e) {
      const { outcome, detail } = outcomeFromError(errMsg(e));
      return this.result(pharmacyId, batchId, unitCode, outcome, detail);
    }
  }

  private result(pharmacyId: string, batchId: string, unitCode: string, outcome: ScanOutcome, detail: string): ScanResult {
    return { pharmacy: PERSONAS[pharmacyId].label, batchId, unitCode, outcome, detail, at: Date.now() };
  }

  // ---- reads ----

  batchesList(): BatchView[] {
    return [...this.batches.values()].map((b) => ({ ...b.view }));
  }

  unitCodes(batchId: string): string[] {
    return this.batches.get(batchId)?.codes ?? [];
  }

  ledgerView(): LedgerView {
    const L = this.sim.ledger as unknown as {
      batch_count: bigint;
      party_count: bigint;
      revoked: SetLike;
    };
    const members = (role: Role): Party[] =>
      Object.values(PERSONAS)
        .filter((p) => p.role === role)
        .map((p) => ({
          ...p,
          revoked: L.revoked.member(partyLeaf(participantId(hexToKey(p.secretKey)))),
        }));

    return {
      batchCount: Number(L.batch_count),
      partyCount: Number(L.party_count),
      manufacturers: members('manufacturer'),
      importers: members('importer'),
      pharmacies: members('pharmacy'),
      batches: this.batchesList(),
      dispensed: [...this.dispensedNullifiers],
      revoked: [...this.revokedLeaves],
    };
  }
}

interface SetLike {
  member(value: Uint8Array): boolean;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function textTo32(text: string): Uint8Array {
  const out = new Uint8Array(32);
  const s = text.slice(0, 32);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function hexToKey(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** A well-formed depth-32 path for a leaf that is NOT in any tree. */
function placeholderPath(leaf: Uint8Array): {
  leaf: Uint8Array;
  path: { sibling: { field: bigint }; goes_left: boolean }[];
} {
  return { leaf, path: Array.from({ length: 32 }, () => ({ sibling: { field: 0n }, goes_left: true })) };
}
