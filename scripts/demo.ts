// CLI walkthrough: `npm run demo`. Runs the real circuits and prints, for each
// event, what the pharmacist learns and what stays private.

import { runDemo, type ScanResult } from './demo-core.js';

const ICON: Record<ScanResult['outcome'], string> = {
  AUTHENTIC: '✅ AUTHENTIC',
  RECALLED: '⛔ RECALLED',
  EXPIRED: '⛔ EXPIRED',
  CLONE: '🚨 CLONE SUSPECTED',
  NOT_IMPORTED: '⛔ UNAUTHORIZED CHANNEL',
  NOT_IN_BATCH: '⛔ NOT THIS BATCH',
  UNKNOWN: '❓ UNKNOWN BATCH',
  REVOKED: '🚫 PARTY REVOKED',
  NOT_A_PHARMACY: '🚫 NOT A PHARMACY',
};

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(72));
const short = (h: string) => `${h.slice(0, 12)}…${h.slice(-8)}`;

const state = runDemo();

line();
line('MedPass — anti-counterfeit medicine passport');
line('Live walkthrough against the real compiled Compact circuits');
rule();

line();
line('ENROLLMENT (regulator only)');
line(`  regulator id        ${short(state.regulator.id)}`);
line(`  manufacturers root  ${short(state.registries.manufacturers[0])}`);
line(`  importers root      ${short(state.registries.importers[0])}`);
line(`  pharmacies root     ${short(state.registries.pharmacies[0])}`);

line();
line('BATCHES ON-CHAIN');
for (const b of state.batches) {
  line(`  ${b.id}  ${b.status.padEnd(8)}  manufacturer ${short(b.manufacturer)}`);
  line(`     expiry=${b.expiry}  imported=${b.imported ? 'yes' : 'no'}  units_root=${short(b.unitsRoot)}`);
  if (b.termsCommitment) line(`     terms_commitment=${short(b.termsCommitment)}  (opaque — terms & pricing private)`);
}

line();
line('PHARMACIST SCANS');
for (const s of state.scans) {
  line(`  [${ICON[s.outcome]}] ${s.pharmacy} scanned ${s.batchId} unit ${s.unit}`);
  line(`      ${s.detail}`);
}

line();
rule();
line('WHAT A VERIFIER SEES ON-CHAIN');
for (const p of state.privacy.onChain) line(`  • ${p}`);
line();
line('WHAT STAYS PRIVATE');
for (const p of state.privacy.private) line(`  • ${p}`);
line();
rule();
line(`batches created: ${state.counts.batches}   parties enrolled: ${state.counts.parties}`);
line();
