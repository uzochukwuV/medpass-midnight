import { clockTime, shortHex } from '../lib/format';
import { EXPLORER_TX } from '../lib/network';
import type { Activity } from '../lib/types';

export function ActivityFeed({ items, onClear }: { items: Activity[]; onClear: () => void }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="muted small">Transaction log</span>
        {items.length ? (
          <button className="btn small ghost" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="empty">Nothing yet. Actions you take appear here with their transaction ids.</div>
      ) : (
        <div className="feed">
          {items.map((a) => (
            <div key={a.id} className={`feed-item ${a.kind}`}>
              <span className="bullet" />
              <div className="body">
                <div className="t">{a.title}</div>
                {a.detail ? <div className="d">{a.detail}</div> : null}
                {a.txId ? (
                  <a className="d mono tx-link" href={EXPLORER_TX(a.txId)} target="_blank" rel="noreferrer">
                    {shortHex(a.txId, 14, 10)} ↗
                  </a>
                ) : null}
              </div>
              <span className="time">{clockTime(a.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

