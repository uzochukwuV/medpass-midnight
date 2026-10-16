import { useState } from 'react';
import { useMedPass } from '../contexts/useMedPass';
import { Card, KV, Pill } from '../components/ui';
import { formatExpiry, shortHex } from '../lib/format';

export function ImporterScreen() {
  const { batches, recordImport, busy, mode } = useMedPass();
  const [selected, setSelected] = useState('');
  const [terms, setTerms] = useState('terms:channel-2026');

  const pending = batches.filter((b) => !b.imported && b.status !== 'RECALLED');
  const imported = batches.filter((b) => b.imported);

  return (
    <div className="grid auto-300">
      <Card className="span-2">
        <h3>
          <span className="glyph">⇄</span> Record an authorized import
        </h3>
        <p className="hint">
          This is the gateway check. Only a registered importer can mark a batch as having cleared an
          authorized channel. The commercial terms are committed as a hash — the contract, and every
          pharmacist who later scans the batch, learns only that an authorized import exists.
        </p>

        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Batch</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a batch…</option>
              {pending.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} — {b.unitCount} units
                </option>
              ))}
            </select>
            <span className="help">{pending.length} batch{pending.length === 1 ? '' : 'es'} awaiting import.</span>
          </div>
          <div className="field">
            <label>Terms label (committed, not revealed)</label>
            <input type="text" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="terms:supplier-contract-2026" />
            <span className="help">Hashed to 32 bytes. Supplier, pricing and quantities stay private.</span>
          </div>
        </div>

        <div className="row">
          <button
            className="btn primary"
            disabled={!!busy || !selected}
            onClick={() => void recordImport(selected, terms)}
          >
            {busy ? <span className="spinner" /> : '⇄'} Record import
          </button>
          {pending.length && !selected ? (
            <button className="btn ghost small" onClick={() => setSelected(pending[0].id)}>
              Pick {pending[0].id}
            </button>
          ) : null}
        </div>
      </Card>

      <Card>
        <h3>
          <span className="glyph">◐</span> Import ledger
        </h3>
        <p className="hint">What the chain records: presence of an import, plus a terms commitment.</p>
        <div className="list" style={{ marginTop: 12 }}>
          {imported.length === 0 ? (
            <div className="empty">No imports recorded yet.</div>
          ) : (
            imported.map((b) => (
              <div key={b.id} className="list-row">
                <div className="grow">
                  <div className="nm mono">{b.id}</div>
                  <div className="id">
                    by {b.importedBy ?? 'importer'} · terms {b.termsCommitment ? shortHex(b.termsCommitment, 8, 6) : '—'}
                  </div>
                </div>
                <Pill tone="ok">imported</Pill>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="span-2">
        <h3>
          <span className="glyph">🔒</span> Privacy of the commercial channel
        </h3>
        <div className="grid cols-2" style={{ marginTop: 10 }}>
          <div>
            <Pill tone="info">revealed</Pill>
            <div style={{ marginTop: 8 }}>
              <KV k="batch was imported" v="yes / no" mono={false} />
              <KV k="terms commitment" v="32-byte hash" />
            </div>
          </div>
          <div>
            <Pill tone="ok">withheld</Pill>
            <div style={{ marginTop: 8 }}>
              <KV k="supplier identity" v="never on-chain" mono={false} />
              <KV k="pricing / quantities" v="never on-chain" mono={false} />
              <KV k="route & dates" v="never on-chain" mono={false} />
            </div>
          </div>
        </div>
        {mode === 'demo' ? (
          <p className="hint" style={{ marginTop: 12 }}>
            Demo mode uses the persona “GlobalMed Imports” as the signing importer.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
