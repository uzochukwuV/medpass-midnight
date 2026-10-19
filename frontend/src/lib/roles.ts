import type { Role } from './types';

/** Display metadata per role. Kept out of the persona fixtures, which are gone. */
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
