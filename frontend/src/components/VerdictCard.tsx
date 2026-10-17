import { Copy, Pill } from './ui';
import { shortHex } from '../lib/format';
import type { ScanOutcome, ScanResult } from '../lib/types';

type CheckState = 'pass' | 'fail' | 'unknown';

interface Check {
  label: string;
  state: CheckState;
}

/**
 * Severity without a third accent colour. Alden allows exactly two chromatic
 * paints, so a stop-class verdict is carried by a solid Ink fill — heavier than
 * any hue — and informational outcomes by Fog.
 */
const OUTCOME_COPY: Record<
  ScanOutcome,
  { title: string; tone: 'ok' | 'stop' | 'info'; icon: string }
> = {
  AUTHENTIC: { title: 'Authentic', tone: 'ok', icon: '✓' },
  RECALLED: { title: 'Recalled — do not dispense', tone: 'stop', icon: '⛔' },
  EXPIRED: { title: 'Expired', tone: 'info', icon: '⌛' },
  CLONE: { title: 'Possible counterfeit', tone: 'stop', icon: '⚠' },
  NOT_IMPORTED: { title: 'Not imported', tone: 'stop', icon: '⛔' },
  NOT_IN_BATCH: { title: 'Unit mismatch', tone: 'stop', icon: '⚠' },
  REVOKED: { title: 'Pharmacy suspended', tone: 'info', icon: '⏸' },
  NOT_A_PHARMACY: { title: 'Not an enrolled pharmacy', tone: 'info', icon: '⏸' },
  UNKNOWN: { title: 'Unknown batch', tone: 'info', icon: '?' },
};

const CHECK_LABELS = [
  'Manufactured by the stated company',
  'Imported via an authorized channel',
  'Not recalled',
  'Not previously dispensed',
];

function checksFor(outcome: ScanOutcome): Check[] {
  const mk = (states: CheckState[], overrideLabel?: string): Check[] =>
    CHECK_LABELS.map((label, i) => ({ label: overrideLabel && i === 3 ? overrideLabel : label, state: states[i] }));
  switch (outcome) {
    case 'AUTHENTIC':
      return mk(['pass', 'pass', 'pass', 'pass']);
    case 'RECALLED':
      return mk(['pass', 'pass', 'fail', 'pass']);
    case 'CLONE':
      return mk(['pass', 'pass', 'pass', 'fail']);
    case 'NOT_IMPORTED':
      return mk(['pass', 'fail', 'pass', 'pass']);
    case 'EXPIRED':
      return mk(['pass', 'pass', 'pass', 'pass'], 'Batch within its expiry window');
    case 'NOT_IN_BATCH':
      return mk(['pass', 'pass', 'pass', 'pass'], 'Unit enrolled in the batch');
    default:
      return mk(['unknown', 'unknown', 'unknown', 'unknown']);
  }
}

function tick(state: CheckState): string {
  return state === 'pass' ? '✓' : state === 'fail' ? '✕' : '–';
}

export function VerdictCard({
  result,
  onDispense,
  busy,
  action,
}: {
  result: ScanResult;
  onDispense?: () => void;
  busy?: boolean;
  action?: React.ReactNode;
}) {
  const meta = OUTCOME_COPY[result.outcome];
  const checks = checksFor(result.outcome);
  const cls = meta.tone === 'ok' ? 'verdict authentic wash' : meta.tone === 'stop' ? 'verdict stop' : 'verdict';
  return (
    <div className={cls}>
      <div className="head">
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

      <div className="row between" style={{ marginTop: 24 }}>
        <div className="row tight">
          <Pill tone="neutral">unit {result.unitCode}</Pill>
          <Pill tone="neutral">batch {result.batchId}</Pill>
        </div>
        <div className="row tight">
          {action}
          {onDispense && result.outcome === 'AUTHENTIC' ? (
            <button className="btn primary" onClick={onDispense} disabled={busy}>
              {busy ? <span className="spinner" /> : '✚'} Dispense unit
            </button>
          ) : null}
        </div>
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
