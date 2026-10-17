import { Link } from 'react-router-dom';
import { Pill } from './ui';
import { formatExpiry, isExpired, shortHex } from '../lib/format';
import { ROUTES } from '../lib/routes';
import type { BatchView } from '../lib/types';

/**
 * One row per batch. `recall` and `linkTo` are optional so the same table
 * serves the manufacturer (recall + detail links) and the read-only overview.
 */
export function BatchTable({
  batches,
  onRecall,
  busy,
  linkTo,
  empty = 'No batches yet.',
}: {
  batches: BatchView[];
  onRecall?: (batchId: string) => void;
  busy?: boolean;
  linkTo?: (b: BatchView) => string;
  empty?: string;
}) {
  if (batches.length === 0) return <div className="empty">{empty}</div>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Batch</th>
          <th>Units</th>
          <th>Expiry</th>
          <th>Root</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {batches.map((b) => (
          <tr key={b.id}>
            <td className="mono">
              {linkTo ? (
                <Link to={linkTo(b)} className="tx-link">
                  {b.id}
                </Link>
              ) : (
                b.id
              )}
            </td>
            <td>{b.unitCount || '—'}</td>
            <td>{formatExpiry(b.expiry)}</td>
            <td className="mono">{shortHex(b.unitsRoot, 8, 6)}</td>
            <td>
              <div className="row tight">
                <Pill tone={b.status === 'RECALLED' ? 'bad' : 'ok'}>{b.status}</Pill>
                <Pill tone={b.imported ? 'info' : 'neutral'}>{b.imported ? 'imported' : 'not imported'}</Pill>
                {isExpired(b.expiry) ? <Pill tone="warn">expired</Pill> : null}
              </div>
            </td>
            <td style={{ textAlign: 'right' }}>
              {onRecall && b.status !== 'RECALLED' ? (
                <button className="btn small danger" disabled={busy} onClick={() => onRecall(b.id)}>
                  Recall
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Party rows. Demo mode lists the cast; live mode can only show self-status. */
export function PartyTable({
  rows,
  busy,
  onRevoke,
  onRestore,
  linkTo,
}: {
  rows: Array<{ id: string; label: string; participantId: string; revoked: boolean }>;
  busy?: boolean;
  onRevoke?: (id: string) => void;
  onRestore?: (id: string) => void;
  linkTo?: (id: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        Not enumerable. The registry is a Merkle tree of leaf commitments, so membership is proved,
        never listed. A party can check its own status on the enrolment page.
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Party</th>
          <th>Participant id</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td>
              {linkTo ? (
                <Link to={linkTo(p.id)} className="tx-link">
                  {p.label}
                </Link>
              ) : (
                p.label
              )}
            </td>
            <td className="mono">{shortHex(p.participantId, 12, 8)}</td>
            <td>{p.revoked ? <Pill tone="bad">revoked</Pill> : <Pill tone="ok">active</Pill>}</td>
            <td style={{ textAlign: 'right' }}>
              {p.revoked && onRestore ? (
                <button className="btn small" disabled={busy} onClick={() => onRestore(p.id)}>
                  Restore
                </button>
              ) : null}
              {!p.revoked && onRevoke ? (
                <button className="btn small danger" disabled={busy} onClick={() => onRevoke(p.id)}>
                  Revoke
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
