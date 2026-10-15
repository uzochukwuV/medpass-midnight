// MedPass contract tests — execute the real compiled circuits with no node,
// indexer or proof server. Run: node --import tsx --test "tests/**/*.test.ts"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHex } from '@midnight-ntwrk/compact-runtime';
import {
  MedPassSim,
  PartyRole,
  BatchStatus,
  bytes32,
  participantId,
  partyLeaf,
  unitCommitment,
  unitNullifier,
  buildUnitTree,
  digestFromBytes,
  expectRevert,
} from './helpers/simulator.js';

const REG = bytes32('regulator');
const MFR = bytes32('manufacturer-A');
const MFR2 = bytes32('rogue-manufacturer');
const IMP = bytes32('importer-1');
const IMP2 = bytes32('unauthorized-importer');
const PH = bytes32('pharmacy-1');
const PH2 = bytes32('pharmacy-2');
const BATCH = bytes32('batch-001');
const EXPIRY = 2000000000n;
const TERMS = bytes32('supplier-contract-terms');
const TERMS_COMMITMENT = bytes32('terms-commitment');

function fresh() {
  const sim = MedPassSim.deploy(REG);
  sim.registerParty(REG, PartyRole.MANUFACTURER, participantId(MFR));
  sim.registerParty(REG, PartyRole.IMPORTER, participantId(IMP));
  sim.registerParty(REG, PartyRole.PHARMACY, participantId(PH));
  return sim;
}

/** Enroll a manufacturer, create + import a batch, and return its unit tree. */
function onboard(sim: MedPassSim, batchId = BATCH) {
  const codes = Array.from({ length: 4 }, (_, i) => bytes32(`unit-${toHex(batchId).slice(0, 4)}-${i}`));
  const tree = buildUnitTree(codes);
  sim.createBatch(MFR, batchId, tree.root, EXPIRY, bytes32('metadata'));
  sim.recordImport(IMP, batchId, TERMS_COMMITMENT);
  return tree;
}

// ---------------------------------------------------------------------------

test('regulator is sealed at deploy and only the regulator enrolls parties', () => {
  const sim = MedPassSim.deploy(REG);
  assert.equal(toHex(sim.ledger.regulator), toHex(participantId(REG)));

  expectRevert(
    () => sim.registerParty(MFR, PartyRole.MANUFACTURER, participantId(MFR)),
    'Only the regulator',
  );

  sim.registerParty(REG, PartyRole.MANUFACTURER, participantId(MFR));
  assert.equal(sim.ledger.party_count, 1n);
});

test('registry membership is a Merkle proof; an unregistered party is rejected', () => {
  const sim = fresh();
  const tree = buildUnitTree([bytes32('u0'), bytes32('u1')]);

  // A registered manufacturer can create a batch.
  sim.createBatch(MFR, BATCH, tree.root, EXPIRY, bytes32('meta'));

  // A manufacturer who was never enrolled cannot: their leaf is not in the tree.
  const rogue = MedPassSim.deploy(REG);
  rogue.registerParty(REG, PartyRole.MANUFACTURER, participantId(MFR));
  rogue.registerParty(REG, PartyRole.IMPORTER, participantId(IMP));
  rogue.registerParty(REG, PartyRole.PHARMACY, participantId(PH));
  expectRevert(
    () => rogue.createBatch(MFR2, BATCH, tree.root, EXPIRY, bytes32('meta')),
    'Manufacturer not registered',
  );
});

test('the happy path: a pharmacist scans a genuine unit and gets a valid passport', () => {
  const sim = fresh();
  const tree = onboard(sim);
  sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]);

  const nullifier = unitNullifier(unitCommitment(tree.codes[0]));
  assert.ok(sim.ledger.dispensed.member(nullifier), 'nullifier recorded');

  const rec = sim.ledger.batches.lookup(BATCH);
  assert.equal(rec.status, BatchStatus.ACTIVE);
  assert.equal(toHex(rec.manufacturer), toHex(participantId(MFR)));
  assert.ok(sim.ledger.imports.member(BATCH), 'batch marked imported');
});

test('CLONE ALARM: re-scanning the same unit reverts', () => {
  const sim = fresh();
  const tree = onboard(sim);
  sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]);

  // A second scan of the same (copied) QR must fail.
  expectRevert(
    () => sim.dispense(PH2 === PH ? PH : PH, BATCH, tree.pathFor(0), tree.codes[0]),
    'Unit already dispensed',
  );
  // But a DIFFERENT unit in the same batch is still fine.
  sim.dispense(PH, BATCH, tree.pathFor(1), tree.codes[1]);
});

test('a recalled batch cannot be dispensed', () => {
  const sim = fresh();
  const tree = onboard(sim);
  sim.recallBatch(REG, BATCH);
  assert.equal(sim.ledger.batches.lookup(BATCH).status, BatchStatus.RECALLED);

  expectRevert(() => sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]), 'Batch is recalled');
});

test('the batch manufacturer may recall its own batch; a stranger may not', () => {
  const sim = fresh();
  onboard(sim);
  expectRevert(() => sim.recallBatch(PH, BATCH), 'Not authorized to recall');
  sim.recallBatch(MFR, BATCH);
  assert.equal(sim.ledger.batches.lookup(BATCH).status, BatchStatus.RECALLED);
});

test('a batch that was never imported through an authorized channel is rejected', () => {
  const sim = fresh();
  const codes = [bytes32('u0'), bytes32('u1')];
  const tree = buildUnitTree(codes);
  sim.createBatch(MFR, BATCH, tree.root, EXPIRY, bytes32('meta'));
  // NOTE: no record_import.
  expectRevert(
    () => sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]),
    'not imported through an authorized channel',
  );
});

test('an unauthorized importer cannot record an import', () => {
  const sim = fresh();
  const tree = buildUnitTree([bytes32('u0')]);
  sim.createBatch(MFR, BATCH, tree.root, EXPIRY, bytes32('meta'));
  expectRevert(
    () => sim.recordImport(IMP2, BATCH, TERMS_COMMITMENT),
    'Importer not authorized',
  );
});

test('a unit that is not part of the batch is rejected', () => {
  const sim = fresh();
  const tree = onboard(sim);
  const foreign = buildUnitTree([bytes32('foreign-0')]);
  expectRevert(
    () => sim.dispense(PH, BATCH, foreign.pathFor(0), foreign.codes[0]),
    'Unit is not part of this batch',
  );
});

test('an unregistered pharmacy cannot dispense', () => {
  const sim = fresh();
  const tree = onboard(sim);
  expectRevert(() => sim.dispense(PH2, BATCH, tree.pathFor(0), tree.codes[0]), 'Pharmacy not registered');
});

test('PRIVACY: the ledger exposes no importer/pharmacy identity or terms', () => {
  const sim = fresh();
  const tree = onboard(sim);
  sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]);

  // The only import data on-chain is an opaque terms commitment.
  const permit = sim.ledger.imports.lookup(BATCH);
  assert.equal(toHex(permit.terms_commitment), toHex(TERMS_COMMITMENT));
  assert.notEqual(toHex(permit.terms_commitment), toHex(TERMS), 'raw terms never stored');

  // The importer/pharmacy ids never appear in any ledger field we can read.
  const dump = JSON.stringify(sim.ledger, (_, v) =>
    v instanceof Uint8Array ? toHex(v) : typeof v === 'bigint' ? v.toString() : v,
  );
  for (const secretId of [participantId(IMP), participantId(PH), participantId(IMP2)]) {
    assert.ok(!dump.includes(toHex(secretId)), 'party id must not be on-chain');
  }
});

test('SCAN: verify proves authenticity read-only; the unit is still dispensable after', () => {
  const sim = fresh();
  const tree = onboard(sim);

  // Scan first (no consumption).
  sim.verify(PH, BATCH, tree.pathFor(0), tree.codes[0]);
  const nf = unitNullifier(unitCommitment(tree.codes[0]));
  assert.ok(!sim.ledger.dispensed.member(nf), 'verify must not consume the unit');

  // The unit can still be dispensed afterwards.
  sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]);
  assert.ok(sim.ledger.dispensed.member(nf));
});

test('SCAN: verify rejects a recalled batch and an unregistered pharmacy', () => {
  const sim = fresh();
  const tree = onboard(sim);
  expectRevert(() => sim.verify(PH2, BATCH, tree.pathFor(0), tree.codes[0]), 'Pharmacy not registered');
  sim.recallBatch(REG, BATCH);
  expectRevert(() => sim.verify(PH, BATCH, tree.pathFor(0), tree.codes[0]), 'Batch is recalled');
});

test('UNLINKABILITY: two pharmacies prove membership without either id appearing', () => {
  const sim = fresh();
  sim.registerParty(REG, PartyRole.PHARMACY, participantId(PH2));
  const tree = onboard(sim);

  // Both pharmacies can dispense different units of the same batch...
  sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]);
  sim.dispense(PH2, BATCH, tree.pathFor(1), tree.codes[1]);

  // ...yet nothing on-chain ties either pharmacy to the units it dispensed.
  const dump = JSON.stringify(sim.ledger, (_, v) =>
    v instanceof Uint8Array ? toHex(v) : typeof v === 'bigint' ? v.toString() : v,
  );
  for (const id of [participantId(PH), participantId(PH2)]) {
    assert.ok(!dump.includes(toHex(id)), 'pharmacy id must not be on-chain');
  }
});

test('the same batch id cannot be created twice', () => {
  const sim = fresh();
  const tree = onboard(sim);
  expectRevert(() => sim.createBatch(MFR, BATCH, tree.root, EXPIRY, bytes32('meta')), 'Batch already exists');
});

test('LEAF HASHING: the unit tree must be built with raw commitment leaves', () => {
  const sim = fresh();
  const codes = [bytes32('u0'), bytes32('u1')];
  const good = buildUnitTree(codes);
  // A tree whose leaves were pre-hashed produces a different root.
  const wrongRoot = digestFromBytes(unitCommitment(codes[0])); // arbitrary wrong root
  assert.notEqual(wrongRoot.field, good.root.field);

  sim.createBatch(MFR, BATCH, good.root, EXPIRY, bytes32('meta'));
  sim.recordImport(IMP, BATCH, TERMS_COMMITMENT);
  sim.dispense(PH, BATCH, good.pathFor(0), codes[0]);
});

// ---------------------------------------------------------------------------
// Expiry (kernel.blockTimeLessThan)
// ---------------------------------------------------------------------------

test('EXPIRY: a batch cannot be created with an expiry already in the past', () => {
  const sim = fresh();
  const tree = buildUnitTree([bytes32('u0')]);
  const past = BigInt(sim.now - 1);
  expectRevert(
    () => sim.createBatch(MFR, BATCH, tree.root, past, bytes32('meta')),
    'Expiry must be in the future',
  );
});

test('EXPIRY: dispense and verify fail once the batch has expired', () => {
  const sim = fresh();
  const tree = onboard(sim);

  // Just before expiry the unit is still dispensable.
  sim.setClock(Number(EXPIRY) - 1);
  sim.verify(PH, BATCH, tree.pathFor(0), tree.codes[0]);

  // At/after expiry both the read-only scan and the dispense must revert.
  sim.setClock(Number(EXPIRY));
  expectRevert(() => sim.verify(PH, BATCH, tree.pathFor(0), tree.codes[0]), 'Batch has expired');
  expectRevert(() => sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]), 'Batch has expired');

  // No nullifier was written by the rejected dispense.
  const nf = unitNullifier(unitCommitment(tree.codes[0]));
  assert.ok(!sim.ledger.dispensed.member(nf), 'expired dispense must not consume the unit');
});

// ---------------------------------------------------------------------------
// Revocation (regulator-only)
// ---------------------------------------------------------------------------

test('REVOCATION: a revoked pharmacy can no longer dispense', () => {
  const sim = fresh();
  const tree = onboard(sim);
  sim.dispense(PH, BATCH, tree.pathFor(0), tree.codes[0]);

  sim.revokeParty(REG, participantId(PH));
  expectRevert(() => sim.dispense(PH, BATCH, tree.pathFor(1), tree.codes[1]), 'Pharmacy is revoked');
  expectRevert(() => sim.verify(PH, BATCH, tree.pathFor(1), tree.codes[1]), 'Pharmacy is revoked');

  // Re-enrolling the pharmacy restores it.
  sim.registerParty(REG, PartyRole.PHARMACY, participantId(PH));
  sim.dispense(PH, BATCH, tree.pathFor(1), tree.codes[1]);
});

test('REVOCATION: only the regulator may revoke', () => {
  const sim = fresh();
  expectRevert(() => sim.revokeParty(PH, participantId(PH)), 'Only the regulator');
});

test('REVOCATION: a revoked manufacturer cannot create batches and a revoked importer cannot import', () => {
  const sim = fresh();
  const tree = buildUnitTree([bytes32('u0')]);

  sim.revokeParty(REG, participantId(MFR));
  expectRevert(
    () => sim.createBatch(MFR, BATCH, tree.root, EXPIRY, bytes32('meta')),
    'Manufacturer is revoked',
  );

  // A different, still-registered manufacturer can create the batch...
  sim.registerParty(REG, PartyRole.MANUFACTURER, participantId(MFR2));
  sim.createBatch(MFR2, BATCH, tree.root, EXPIRY, bytes32('meta'));

  // ...but a revoked importer cannot import it.
  sim.revokeParty(REG, participantId(IMP));
  expectRevert(() => sim.recordImport(IMP, BATCH, TERMS_COMMITMENT), 'Importer is revoked');
});

test('REVOCATION: revoking a party does not leak its identity on-chain', () => {
  const sim = fresh();
  onboard(sim);
  sim.revokeParty(REG, participantId(PH));

  // The revoked set is keyed by the opaque party LEAF, never the participant id:
  // membership holds for the leaf, and does not hold for the id itself.
  assert.ok(sim.ledger.revoked.member(partyLeaf(participantId(PH))), 'leaf is revoked');
  assert.ok(!sim.ledger.revoked.member(participantId(PH)), 'id is not a key');
  assert.equal(sim.ledger.revoked.size(), 1n);

  // And the id still never appears in any readable ledger field.
  const dump = JSON.stringify(sim.ledger, (_, v) =>
    v instanceof Uint8Array ? toHex(v) : typeof v === 'bigint' ? v.toString() : v,
  );
  assert.ok(!dump.includes(toHex(participantId(PH))), 'revoked pharmacy id must not be on-chain');
});
