import { Copy, Pill } from './ui';
import { shortHex } from '../lib/format';
import type { ScanOutcome, ScanResult } from '../lib/types';

type CheckState = 'pass' | 'fail' | 'unknown';

interface Check {
  label: string;
  state: CheckState;
}

const OUTCOME_COPY: Record<ScanOutcome, { title: string; tone: 'ok' | 'bad' | 'warn'; icon: string }> = {
  AUTHENTIC: { title: 'Authentic', tone: 'ok', icon: '✓' },
  RECALLED: { title: 'Recalled', tone: 'bad', icon: '⛔' },
  EXPIRED: { title: 'Expired', tone: 'warn', icon: '⌛' },
  CLONE: { title: 'Possible counterfeit', tone: 'bad', icon: '⚠' },
  NOT_IMPORTED: { title: 'Not imported', tone: 'bad', icon: '⛔' },
  NOT_IN_BATCH: { title: 'Unit mismatch', tone: 'bad', icon: '⚠' },
  REVOKED: { title: 'Pharmacy suspended', tone: 'warn', icon: '⏸' },
  NOT_A_PHARMACY: { title: 'Not an enrolled pharmacy', tone: 'warn', icon: '⏸' },
  UNKNOWN: { title: 'Unknown batch', tone: 'warn', icon: '?' },
};

function checksFor(outcome: ScanOutcome): Check[] {
  const all: CheckState[] = ['pass', 'pass', 'pass', 'pass'];
  const [made, imported, recalled, dispensed] = all;
  switch (outcome) {
    case 'AUTHENTIC':
      return mk(made, imported, recalled, dispensed);
    case 'RECALLED':
      return mk('pass', 'pass', 'fail', 'pass');
    case 'EXPIRED':
      return mk('pass', 'pass', 'pass', 'pass', 'Batch within its expiry window');
    case 'CLONE':
      return mk('pass', 'pass', 'pass', 'fail');
    case 'NOT_IMPORTED':
      return mk('pass', 'fail', 'pass', 'pass');
    case 'NOT_IN_BATCH':
      return mk('pass', 'pass', 'pass', 'pass', 'Unit enrolled in the batch');
    case 'REVOKED':
    case 'NOT_A_PHARMACY':
      return mk('unknown', 'unknown', 'unknown', 'unknown');
    case 'UNKNOWN':
    default:
      return mk('unknown', 'unknown', 'unknown', 'unknown');
  }
}

function mk(
  made: CheckState,
  imported: CheckState,
  recalled: CheckState,
  dispensed: CheckState,
  overrideLabel?: string,
): Check[] {
  return [
    { label: 'Manufactured by the stated company', state: made },
    { label: 'Imported via an authorized channel', state: imported },
    { label: 'Not recalled', state: recalled },
    { label: overrideLabel ?? 'Not previously dispensed', state: dispensed },
  ];
}

function tick(state: CheckState): string {
  return state === 'pass' ? '✓' : state === 'fail' ? '✕' : '–';
}

export function ScanVerdict({ result, onDispense, busy }: { result: ScanResult; onDispense?: () => void; busy?: boolean }) {
  const meta = OUTCOME_COPY[result.outcome];
  const checks = checksFor(result.outcome);
  return (
    <div className={`verdict ${meta.tone}`}>
      <div className="big">
        <div className="icon">{meta.icon}</div>
        <div>
          <div className="title">{meta.title}</div>
          <div className="sub">{result.detail}</div>
        </div>
      </div>

      <div className="checks">
        {checks.map((c) => (
          <div key={c.label} className={`check ${c.state}`}>
            <span className="tick">{tick(c.state)}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="row between" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <Pill tone="neutral">unit {result.unitCode}</Pill>
          <Pill tone="neutral">batch {result.batchId}</Pill>
        </div>
        {onDispense && result.outcome === 'AUTHENTIC' ? (
          <button className="btn primary" onClick={onDispense} disabled={busy}>
            {busy ? <span className="spinner" /> : '✚'} Dispense unit
          </button>
        ) : null}
      </div>

      {result.nullifier ? (
        <details className="tech">
          <summary>Technical detail</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted small mono">nullifier {shortHex(result.nullifier, 12, 10)}</span>
            <Copy value={result.nullifier} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
