import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMedPass } from '../../contexts/useMedPass';
import { Card, Copy, KV, PageHeader, Pill, Section } from '../../components/ui';
import { BatchTable } from '../../components/tables';
import { EnrolmentPanel } from '../../components/RequireRole';
import { ROUTES } from '../../lib/routes';

const DEFAULT_CODES = ['AMX-2026-01-0001', 'AMX-2026-01-0002', 'AMX-2026-01-0003', 'AMX-2026-01-0004'];

export function ManufacturerHome() {
  const { batches, createBatch, recall, busy } = useMedPass();
  const [batchId, setBatchId] = useState('AMX-2026-02');
  const [codesText, setCodesText] = useState(DEFAULT_CODES.join('\n'));
  const [expiryDays, setExpiryDays] = useState(365);
  const [metadata, setMetadata] = useState('meta:amoxicillin-500mg');

  const codes = useMemo(() => codesText.split('\n').map((c) => c.trim()).filter(Boolean), [codesText]);
  // The batch record holds a commitment, not an identity, so this list is the
  // ledger's rather than a per-manufacturer filter. The heading says so.
  const mine = batches;

  const onCreate = () => {
    if (!batchId.trim() || codes.length === 0) return;
    void createBatch(batchId.trim(), codes, expiryDays, metadata);
  };

  return (
    <>
      <PageHeader
        eyebrow="Manufacturer"
        title="Register, then commit a batch."
        accent="commit"
        lede="You must be enrolled before you can create a batch. Each unit code is committed into a Merkle tree — only the tree's root goes on-chain, so the raw codes stay in your hands and on the unit labels."
      />

      <Section title="Registration" sub="your standing with the regulator">
        <Card>
          <EnrolmentPanel role="manufacturer" />
        </Card>
      </Section>

      <Section title="Create a batch" sub="one Merkle root per batch">
        <Card>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="batch-id">Batch id</label>
              <input id="batch-id" type="text" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="AMX-2026-02" />
            </div>
            <div className="field">
              <label htmlFor="expiry-days">Expiry (days from now)</label>
              <input id="expiry-days" type="number" value={expiryDays} min={1} onChange={(e) => setExpiryDays(Number(e.target.value))} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="unit-codes">Unit codes — one per line</label>
            <textarea
              id="unit-codes"
              value={codesText}
              rows={6}
              onChange={(e) => setCodesText(e.target.value)}
              spellCheck={false}
              className="mono"
            />
            <span className="help">
              {codes.length} unit{codes.length === 1 ? '' : 's'} will be enrolled under one root.
            </span>
          </div>

          <div className="field">
            <label htmlFor="metadata">Metadata label</label>
            <input id="metadata" type="text" value={metadata} onChange={(e) => setMetadata(e.target.value)} placeholder="meta:drug-strength" />
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
        </Card>
      </Section>

      <Section title="Your batches" sub="recall and unit sheets live on the batch page">
        <Card>
          <BatchTable
            batches={mine}
            busy={!!busy}
            onRecall={recall}
            linkTo={(b) => ROUTES.batch(b.id)}
            empty="No batches yet."
          />
          <p className="hint" style={{ marginTop: 16 }}>
            A batch becomes dispensable only after an importer records it.
          </p>
        </Card>
      </Section>

      <Section title="What leaves this screen" sub="the privacy boundary">
        <Card>
          <div className="grid cols-3">
            <div>
              <Pill tone="info">on-chain</Pill>
              <div style={{ marginTop: 10 }}>
                <KV k="units root" v="one Merkle root" />
                <KV k="metadata" v="hash only" />
                <KV k="batch id" v="public" />
              </div>
            </div>
            <div>
              <Pill tone="ok">stays private</Pill>
              <div style={{ marginTop: 10 }}>
                <KV k="unit codes" v="never on-chain" mono={false} />
                <KV k="unit count" v="implied, not stored" mono={false} />
                <KV k="supplier terms" v="commitment only" mono={false} />
              </div>
            </div>
            <div>
              <Pill tone="neutral">at the counter</Pill>
              <div style={{ marginTop: 10 }}>
                <KV k="verdict" v="proof, not data" mono={false} />
                <KV k="dispense" v="one-time nullifier" mono={false} />
              </div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <Copy value="medpass:units-root:v1" label="Copy schema tag" />
            <Link className="btn small ghost" to={ROUTES.importer}>
              Importer →
            </Link>
          </div>
        </Card>
      </Section>
    </>
  );
}
