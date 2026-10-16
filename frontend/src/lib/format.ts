/** Small, dependency-free formatting helpers used across the UI. */

export function shortHex(hex: string | undefined, head = 8, tail = 6): string {
  if (!hex) return '—';
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '').replace(/[^0-9a-fA-F]/g, '');
  const even = clean.length % 2 ? clean.slice(0, -1) : clean;
  const out = new Uint8Array(even.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic 32-byte value from a short tag (mirrors the simulator fixture). */
export function tagToBytes32(tag: number | string): Uint8Array {
  const out = new Uint8Array(32);
  const s = String(tag);
  for (let i = 0; i < s.length && i < 32; i++) out[i] = s.charCodeAt(i);
  out[31] = typeof tag === 'number' ? tag & 0xff : s.length;
  return out;
}

/** Encode a human unit code (e.g. "AMX-2026-0001") into the 32-byte circuit input. */
export function unitCodeToBytes(code: string): Uint8Array {
  const out = new Uint8Array(32);
  const s = code.trim();
  for (let i = 0; i < s.length && i < 32; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function unitCodeFromBytes(bytes: Uint8Array): string {
  const s = new TextDecoder().decode(bytes).replace(/\0+$/, '');
  return s;
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Expiry is stored as a Unix seconds value in the circuit. */
export function expiryFromDays(days: number): number {
  return Math.floor(Date.now() / 1000) + Math.round(days * 86_400);
}

export function formatExpiry(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  const ms = unixSeconds * 1000;
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function isExpired(unixSeconds: number): boolean {
  return unixSeconds > 0 && Date.now() / 1000 > unixSeconds;
}
