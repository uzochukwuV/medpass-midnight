import { Link } from 'react-router-dom';
import { Pill } from './ui';
import { formatExpiry, isExpired, shortHex } from '../lib/format';
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
