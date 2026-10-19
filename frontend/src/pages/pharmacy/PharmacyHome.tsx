import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMedPass } from '../../contexts/useMedPass';
import { Card, EmptyState, PageHeader, Section } from '../../components/ui';
import { QrScanner } from '../../components/QrScanner';
import { VerdictCard } from '../../components/VerdictCard';
import { EnrolmentPanel } from '../../components/RequireRole';
import { ROUTES } from '../../lib/routes';
import { shortHex } from '../../lib/format';

export function PharmacyHome() {
  const { scan, lastScan, scans, batches, busy } = useMedPass();
  const [scanning, setScanning] = useState(false);
  const [unitCode, setUnitCode] = useState('');
  const [batchId, setBatchId] = useState('');

  const recent = scans.slice(0, 8);

  const runScan = async (code: string, batch: string, dispense: boolean) => {
    const trimmed = code.trim();
    const targetBatch = (batch || batches[0]?.id || '').trim();
    if (!trimmed || !targetBatch) return;
    const result = await scan(targetBatch, trimmed, dispense);
    if (result) {
      setUnitCode(trimmed);
      setBatchId(targetBatch);
    }
  };

  const onDecoded = (text: string) => {
    // A unit QR payload may be "BATCH|UNIT"; otherwise the whole value is the code.
    const [maybeBatch, maybeUnit] = text.includes('|') ? text.split('|') : ['', text];
    void runScan(maybeUnit, maybeBatch, false);
  };

  const activeBatch = batchId || batches[0]?.id || '';

  return (
    <>
      <PageHeader
        eyebrow="Pharmacy"
        title="Scan a unit. Read the proof."
        accent="proof"
        lede="Point the camera at a unit QR code, or type the code. The scan proves the unit was made by the stated manufacturer, imported through an authorized channel and is not recalled — without revealing any of that data."
      />

      <Section title="Registration" sub="your standing with the regulator">
        <Card>
          <EnrolmentPanel role="pharmacy" />
        </Card>
      </Section>

      <Section title="Counter scan" sub="verify is read-only">
        <Card>
          <div className="grid cols-2">
            <div>
              <QrScanner active={scanning} onResult={onDecoded} />
              <div className="row" style={{ marginTop: 12 }}>
                <button className={`btn ${scanning ? 'danger' : 'primary'}`} onClick={() => setScanning((s) => !s)}>
                  {scanning ? '■ Stop camera' : '⦿ Start camera'}
                </button>
              </div>
            </div>

            <div>
              <div className="field">
                <label htmlFor="unit-code">Unit code</label>
                <input
                  id="unit-code"
                  type="text"
                  className="mono"
                  value={unitCode}
                  placeholder="AMX-2026-01-0001"
                  onChange={(e) => setUnitCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runScan(unitCode, activeBatch, false)}
                />
              </div>
              <div className="field">
                <label htmlFor="scan-batch">Batch</label>
                <select id="scan-batch" value={activeBatch} onChange={(e) => setBatchId(e.target.value)}>
                  {batches.length === 0 ? <option value="">no batches</option> : null}
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} {b.status === 'RECALLED' ? '(recalled)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row">
                <button
                  className="btn primary"
                  disabled={!!busy || !unitCode.trim()}
                  onClick={() => void runScan(unitCode, activeBatch, false)}
                >
                  {busy ? <span className="spinner" /> : '✓'} Verify only
                </button>
                <button className="btn" disabled={!!busy || !unitCode.trim()} onClick={() => void runScan(unitCode, activeBatch, true)}>
                  ✚ Dispense
                </button>
              </div>
              <p className="hint" style={{ marginTop: 12 }}>
                Verify is read-only — safe to run before a sale. Dispense burns a one-time nullifier;
                scanning the same unit again will flag it as a possible counterfeit.
              </p>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Verdict" sub="the last scan this session">
        <Card>
          {lastScan ? (
            <VerdictCard
              result={lastScan}
              busy={!!busy}
              onDispense={() => void runScan(lastScan.unitCode, lastScan.batchId, true)}
            />
          ) : (
            <EmptyState title="No scan yet">
              The verdict — authentic, recalled, clone, not imported — will appear here.
            </EmptyState>
          )}
        </Card>
      </Section>

      <Section
        title="Recent scans"
        sub="this session"
        right={
          <Link className="btn small ghost" to={ROUTES.scanHistory}>
            Full history →
          </Link>
        }
      >
        <Card>
          {recent.length === 0 ? (
            <EmptyState title="Nothing scanned yet" />
          ) : (
            <div className="list">
              {recent.map((s, i) => (
                <div key={`${s.unitCode}-${i}`} className="list-row">
                  <div className="grow">
                    <div className="nm mono">{s.unitCode}</div>
                    <div className="id">{s.batchId}</div>
                  </div>
                  <span className={`pill ${s.outcome === 'AUTHENTIC' ? 'ok' : 'bad'}`}>{s.outcome}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>

      <Section title="Why it is private" sub="what the proof hides">
        <Card>
          <div className="grid cols-3">
            <div className="check pass">
              <span className="tick">✓</span> Registered pharmacy, unlinked on-chain
            </div>
            <div className="check pass">
              <span className="tick">✓</span> Unit code proven, never revealed
            </div>
            <div className="check pass">
              <span className="tick">✓</span> Clone alarm via one-time nullifier
            </div>
          </div>
          {lastScan?.nullifier ? (
            <p className="hint" style={{ marginTop: 12 }}>
              Last nullifier <span className="mono">{shortHex(lastScan.nullifier, 10, 8)}</span>
            </p>
          ) : null}
        </Card>
      </Section>
    </>
  );
}
