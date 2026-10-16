// The MedPass identity is the app's own keypair, independent of the wallet.
// The contract reads the actor from the `caller_sk` WITNESS, and the wallet
// connector deliberately never exposes the wallet's secret key — so the app
// holds its own 32-byte secret, and the regulator enrols participant_id(secret).
// The wallet is used only to pay DUST fees and to submit the transaction.

import { participantId } from '@medpass/simulator';
import { bytesToHex, hexToBytes } from './format';

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
  const sk = random32();
  const identity: Identity = {
    secretKey: bytesToHex(sk),
    participantId: bytesToHex(participantId(sk)),
    label: 'This device',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function identityKeyBytes(identity: Identity): Uint8Array {
  return hexToBytes(identity.secretKey);
}

/** Encode a participant id (hex) into the 32-byte circuit input. */
export function participantIdBytes(hex: string): Uint8Array {
  return hexToBytes(hex);
}
