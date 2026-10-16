import { participantId } from '@medpass/simulator';
import { bytesToHex, tagToBytes32 } from './format';
import type { Party, Role } from './types';

/**
 * Demo personas. Each holds a 32-byte secret key that is only ever used inside
 * the browser (demo mode) or handed to the local prover — it never reaches the
 * indexer. In live mode the connected wallet supplies the acting key instead.
 */
interface PersonaSeed {
  id: string;
  role: Role;
  label: string;
  tag: string;
}

const SEEDS: PersonaSeed[] = [
  { id: 'regulator', role: 'regulator', label: 'Midnight Medicines Authority', tag: 'regulator-key' },
  { id: 'acme', role: 'manufacturer', label: 'Acme Pharma Ltd', tag: 'acme-pharma-key' },
  { id: 'globalmed', role: 'importer', label: 'GlobalMed Imports', tag: 'globalmed-imports-key' },
  { id: 'citycare', role: 'pharmacy', label: 'CityCare Pharmacy', tag: 'citycare-pharmacy-key' },
  { id: 'ruralhealth', role: 'pharmacy', label: 'RuralHealth Pharmacy', tag: 'ruralhealth-pharmacy-key' },
  { id: 'outsider', role: 'pharmacy', label: 'Unregistered Clinic', tag: 'unregistered-pharmacy-key' },
];

export const PERSONAS: Record<string, Party> = Object.fromEntries(
  SEEDS.map((s) => {
    const secret = tagToBytes32(s.tag);
    return [
      s.id,
      {
        id: s.id,
        role: s.role,
        label: s.label,
        participantId: bytesToHex(participantId(secret)),
        secretKey: bytesToHex(secret),
        revoked: false,
      } satisfies Party,
    ];
  }),
);

export const DEMO_ORDER: string[] = ['regulator', 'acme', 'globalmed', 'citycare', 'ruralhealth', 'outsider'];

export function persona(id: string): Party {
  const p = PERSONAS[id];
  if (!p) throw new Error(`unknown persona: ${id}`);
  return p;
}

export const ROLE_META: Record<Role, { label: string; blurb: string; glyph: string }> = {
  regulator: {
    label: 'Regulator',
    blurb: 'Seals the trust root and enrols or revokes the parties allowed to act.',
    glyph: '§',
  },
  manufacturer: {
    label: 'Manufacturer',
    blurb: 'Creates a batch and enrols its units under a single Merkle root.',
    glyph: '⚙',
  },
  importer: {
    label: 'Importer',
    blurb: 'Records that a batch cleared an authorised import channel.',
    glyph: '⇄',
  },
  pharmacy: {
    label: 'Pharmacy',
    blurb: 'Scans a unit and receives a zero-knowledge verdict, then dispenses it.',
    glyph: '✚',
  },
};
