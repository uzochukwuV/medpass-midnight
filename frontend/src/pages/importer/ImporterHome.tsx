import { useState } from 'react';
import { useMedPass } from '../../contexts/useMedPass';
import { Card, EmptyState, KV, PageHeader, Pill, Section } from '../../components/ui';
import { BatchTable } from '../../components/tables';
import { EnrolmentPanel } from '../../components/RequireRole';

export function ImporterHome() {
  const { batches, recordImport, busy } = useMedPass();
  const [selected, setSelected] = useState('');
  const [terms, setTerms] = useState('terms:channel-2026');

  const pending = batches.filter((b) => !b.imported && b.status !== 'RECALLED');
  const imported = batches.filter((b) => b.imported);

  return (
    <>
      <PageHeader
        eyebrow="Importer"
        title="Clear a batch through an authorized channel."
        accent="authorized"
        lede="This is the gateway check. Only an enrolled importer can mark a batch as having cleared an authorized channel, and the commercial terms are committed as a hash — the contract, and every pharmacist who later scans the batch, learns only that an authorized import exists."
      />

      <Section title="Registration" sub="your standing with the regulator">
        <Card>
          <EnrolmentPanel role="importer" />
        </Card>
      </Section>

      <Section title="Record an import" sub="one batch at a time">
        <Card>
          {pending.length === 0 ? (
            <EmptyState title="Nothing awaiting import">
              Every batch on-chain is either already imported or recalled. Create one as the
              manufacturer to exercise this flow.
            </EmptyState>
          ) : (
            <>
              <div className="grid cols-2">
                <div className="field">
                  <label htmlFor="import-batch">Batch</label>
                  <select id="import-batch" value={selected} onChange={(e) => setSelected(e.target.value)}>
                    <option value="">Select a batch…</option>
                    {pending.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.unitCount} units
                      </option>
                    ))}
                  </select>
                  <span className="help">
                    {pending.length} batch{pending.length === 1 ? '' : 'es'} awaiting import.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="import-terms">Terms label — committed, not revealed</label>
                  <input
                    id="import-terms"
                    type="text"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="terms:supplier-contract-2026"
                  />
                  <span className="help">Hashed to 32 bytes. Supplier, pricing and quantities stay private.</span>
                </div>
              </div>
              <div className="row">
                <button className="btn primary" disabled={!!busy || !selected} onClick={() => void recordImport(selected, terms)}>
                  {busy ? <span className="spinner" /> : '⇄'} Record import
                </button>
                <button className="btn ghost small" onClick={() => setSelected(pending[0].id)}>
                  Pick {pending[0].id}
                </button>
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title="Import ledger" sub="presence, plus a commitment">
        <Card>
          {imported.length === 0 ? (
            <EmptyState title="No imports recorded yet">
              A batch becomes dispensable only after an import is recorded here.
            </EmptyState>
          ) : (
            <BatchTable batches={imported} empty="No imports recorded yet." />
          )}
        </Card>
      </Section>

      <Section title="Privacy of the commercial channel" sub="revealed vs. withheld">
        <Card>
          <div className="grid cols-2">
            <div>
              <Pill tone="info">revealed</Pill>
              <div style={{ marginTop: 10 }}>
                <KV k="batch was imported" v="yes / no" mono={false} />
                <KV k="terms commitment" v="32-byte hash" />
              </div>
            </div>
            <div>
              <Pill tone="ok">withheld</Pill>
              <div style={{ marginTop: 10 }}>
                <KV k="supplier identity" v="never on-chain" mono={false} />
                <KV k="pricing / quantities" v="never on-chain" mono={false} />
                <KV k="route & dates" v="never on-chain" mono={false} />
              </div>
            </div>
          </div>
        </Card>
      </Section>
    </>
  );
}
