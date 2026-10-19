// The MedPass identity is the app's own keypair, independent of the wallet.
// The contract reads the actor from the `caller_sk` WITNESS, and the wallet
// connector deliberately never exposes the wallet's secret key — so the app
// holds its own 32-byte secret, and the regulator enrols participant_id(secret).
// The wallet is used only to pay DUST fees and to submit the transaction.
//
// The constructor seals participant_id(caller_sk()) of whoever deploys, so the
// key held here decides who the regulator is. It is therefore importable: a
// regulator brings their own key rather than being handed a random one.

import { participantId } from '@medpass/simulator';
import { bytesToHex } from './format';

const STORAGE_KEY = 'medpass.identity.v1';

export interface Identity {
  /** 32-byte app secret, hex. Never leaves this browser. */
  secretKey: string;
  /** The public handle the regulator enrols. */
  participantId: string;
  label: string;
}

function random32(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

function fromSecret(sk: Uint8Array, label = 'This device'): Identity {
  return {
    secretKey: bytesToHex(sk),
    participantId: bytesToHex(participantId(sk)),
    label,
  };
}

function persist(identity: Identity): Identity {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function loadIdentity(): Identity {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Identity;
    } catch {
      /* fall through and regenerate */
    }
  }
  return regenerateIdentity();
}

export function regenerateIdentity(): Identity {
  return persist(fromSecret(random32()));
}

/**
 * Parse a pasted secret key. Strict on purpose: `hexToBytes` silently drops
 * non-hex characters and truncates odd lengths, which would turn a typo into a
 * valid-looking but wrong key — and a wrong regulator key cannot be undone.
 */
export function parseSecretKey(input: string): Uint8Array {
  const clean = input.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('A secret key is exactly 64 hex characters (32 bytes).');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Adopt a supplied secret key as this device's identity. */
export function importIdentity(input: string, label = 'Imported key'): Identity {
  return persist(fromSecret(parseSecretKey(input), label));
}

/** True when `input` is a well-formed 32-byte hex value (secret key or party id). */
export function isHex32(input: string): boolean {
  try {
    parseSecretKey(input);
    return true;
  } catch {
    return false;
  }
}

export function identityKeyBytes(identity: Identity): Uint8Array {
  return parseSecretKey(identity.secretKey);
}

/** Encode a participant id (hex) into the 32-byte circuit input. */
export function participantIdBytes(hex: string): Uint8Array {
  return parseSecretKey(hex);
}
