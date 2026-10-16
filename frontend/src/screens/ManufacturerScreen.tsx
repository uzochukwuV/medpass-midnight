import { useMemo, useState } from 'react';
import { useMedPass } from '../contexts/useMedPass';
import { Card, Copy, KV, Pill } from '../components/ui';
import { formatExpiry, isExpired, shortHex } from '../lib/format';

const DEFAULT_CODES = ['AMX-2026-01-0001', 'AMX-2026-01-0002', 'AMX-2026-01-0003', 'AMX-2026-01-0004'];

export function ManufacturerScreen() {
  const { batches, createBatch, recall, busy, mode, demoPharmacy } = useMedPass();
  const [batchId, setBatchId] = useState('AMX-2026-02');
  const [codesText, setCodesText] = useState(DEFAULT_CODES.join('\n'));
  const [expiryDays, setExpiryDays] = useState(365);
  const [metadata, setMetadata] = useState('meta:amoxicillin-500mg');

  const codes = useMemo(
    () => codesText.split('\n').map((c) => c.trim()).filter(Boolean),
    [codesText],
  );

  const onCreate = () => {
    if (!batchId.trim() || codes.length === 0) return;
    void createBatch(batchId.trim(), codes, expiryDays, metadata);
  };

  return (
    <div className="grid auto-300">
      <Card className="span-2">
        <h3>
          <span className="glyph">⚙</span> Create a batch
        </h3>
        <p className="hint">
          Each unit code is committed into a Merkle tree. Only the tree's root goes on-chain — the
          raw codes stay in your hands and on the unit labels.
        </p>

        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Batch id</label>
            <input type="text" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="AMX-2026-02" />
          </div>
          <div className="field">
            <label>Expiry (days from now)</label>
            <input type="number" value={expiryDays} min={1} onChange={(e) => setExpiryDays(Number(e.target.value))} />
          </div>
        </div>

        <div className="field">
          <label>Unit codes — one per line</label>
          <textarea
            value={codesText}
            rows={6}
            onChange={(e) => setCodesText(e.target.value)}
            spellCheck={false}
            className="mono"
          />
          <span className="help">{codes.length} unit{codes.length === 1 ? '' : 's'} will be enrolled under one root.</span>
        </div>

        <div className="field">
          <label>Metadata label</label>
          <input type="text" value={metadata} onChange={(e) => setMetadata(e.target.value)} placeholder="meta:drug-strength" />
          <span className="help">Hashed and stored publicly. Keep it non-sensitive.</span>
        </div>

        <div className="row">
          <button className="btn primary" disabled={!!busy || !batchId.trim() || codes.length === 0} onClick={onCreate}>
            {busy ? <span className="spinner" /> : '⚙'} Create batch
          </button>
          <button className="btn ghost small" onClick={() => setCodesText(DEFAULT_CODES.join('\n'))}>
            Reset units
          </button>
        </div>

        <details className="tech">
          <summary>Unit sheet (for printing / QR export)</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {codes.map((c) => (
              <div key={c} className="list-row">
                <div className="grow mono">{c}</div>
                <Copy value={c} />
              </div>
            ))}
          </div>
        </details>
      </Card>

      <Card>
        <h3>
          <span className="glyph">▤</span> Your batches
        </h3>
        <p className="hint">
          {mode === 'demo'
            ? 'Recall works here; imported state is driven by the importer role.'
            : 'A batch becomes dispensable only after an importer records it.'}
        </p>
        <div className="list" style={{ marginTop: 12 }}>
          {batches.length === 0 ? (
            <div className="empty">No batches yet.</div>
          ) : (
            batches.map((b) => (
              <div key={b.id} className="list-row" style={{ flexWrap: 'wrap' }}>
                <div className="grow">
                  <div className="nm mono">{b.id}</div>
                  <div className="id">
                    {b.unitCount} units · exp {formatExpiry(b.expiry)} · root {shortHex(b.unitsRoot, 8, 6)}
                  </div>
                </div>
                <Pill tone={b.status === 'RECALLED' ? 'bad' : 'ok'}>{b.status}</Pill>
                <Pill tone={b.imported ? 'info' : 'neutral'}>{b.imported ? 'imported' : 'not imported'}</Pill>
                {isExpired(b.expiry) ? <Pill tone="warn">expired</Pill> : null}
                {b.status !== 'RECALLED' ? (
                  <button className="btn small danger" disabled={!!busy} onClick={() => recall(b.id)}>
                    Recall
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="span-2">
        <h3>
          <span className="glyph">◈</span> What leaves this screen
        </h3>
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          <div>
            <Pill tone="info">on-chain</Pill>
            <div style={{ marginTop: 8 }}>
              <KV k="units root" v="one Merkle root" />
              <KV k="metadata" v="hash only" />
              <KV k="batch id" v="public" />
            </div>
          </div>
          <div>
            <Pill tone="ok">stays private</Pill>
            <div style={{ marginTop: 8 }}>
              <KV k="unit codes" v="never on-chain" mono={false} />
              <KV k="unit count" v="implied, not stored" mono={false} />
              <KV k="supplier terms" v="commitment only" mono={false} />
            </div>
          </div>
          <div>
            <Pill tone="neutral">at the counter</Pill>
            <div style={{ marginTop: 8 }}>
              <KV k="verdict" v="proof, not data" mono={false} />
              <KV k="dispense" v="one-time nullifier" mono={false} />
              <KV k="scanning role" v="demo: {demoPharmacy}" mono={false} />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
