import { useState } from 'react';
import { useMedPass } from '../contexts/useMedPass';
import { Card, Pill } from '../components/ui';
import { QrScanner } from '../components/QrScanner';
import { ScanVerdict } from '../components/ScanVerdict';
import { PERSONAS } from '../lib/personas';
import { shortHex } from '../lib/format';
import type { ScanResult } from '../lib/types';

export function PharmacyScreen() {
  const { scan, lastScan, batches, busy, mode, demoPharmacy, setDemoPharmacy } = useMedPass();
  const [scanning, setScanning] = useState(false);
  const [unitCode, setUnitCode] = useState('');
  const [batchId, setBatchId] = useState('');
  const [history, setHistory] = useState<ScanResult[]>([]);

  const pharmacies = Object.values(PERSONAS).filter((p) => p.role === 'pharmacy');

  const runScan = async (code: string, batch: string, dispense: boolean) => {
    const trimmed = code.trim();
    const targetBatch = (batch || batches[0]?.id || '').trim();
    if (!trimmed || !targetBatch) return;
    const result = await scan(targetBatch, trimmed, dispense);
    if (result) {
      setHistory((h) => [result, ...h].slice(0, 12));
      setUnitCode(trimmed);
      setBatchId(targetBatch);
    }
  };

  const onDecoded = (text: string) => {
    // A unit QR payload may be "BATCH|UNIT"; otherwise treat the whole value as the unit code.
    const [maybeBatch, maybeUnit] = text.includes('|') ? text.split('|') : ['', text];
    void runScan(maybeUnit, maybeBatch, false);
  };

  const activeBatch = batchId || batches[0]?.id || '';

  return (
    <div className="grid auto-300">
      <Card className="span-2">
        <div className="row between">
          <h3>
            <span className="glyph">✚</span> Scan a unit
          </h3>
          {mode === 'demo' ? (
            <div className="row">
              <span className="muted small">Scanning as</span>
              <select value={demoPharmacy} onChange={(e) => setDemoPharmacy(e.target.value)}>
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <p className="hint">
          Point the camera at a unit QR code, or type the code. The scan proves the unit was made by
          the stated manufacturer, imported through an authorized channel and is not recalled — without
          revealing any of that data.
        </p>

        <div className="grid cols-2" style={{ marginTop: 14 }}>
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
              <label>Unit code</label>
              <input
                type="text"
                className="mono"
                value={unitCode}
                placeholder="AMX-2026-01-0001"
                onChange={(e) => setUnitCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runScan(unitCode, activeBatch, false)}
              />
            </div>
            <div className="field">
              <label>Batch</label>
              <select value={activeBatch} onChange={(e) => setBatchId(e.target.value)}>
                {batches.length === 0 ? <option value="">no batches</option> : null}
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} {b.status === 'RECALLED' ? '(recalled)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button className="btn primary" disabled={!!busy || !unitCode.trim()} onClick={() => void runScan(unitCode, activeBatch, false)}>
                {busy ? <span className="spinner" /> : '✓'} Verify only
              </button>
              <button className="btn" disabled={!!busy || !unitCode.trim()} onClick={() => void runScan(unitCode, activeBatch, true)}>
                ✚ Dispense
              </button>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              <b>Verify</b> is read-only — safe to run before a sale. <b>Dispense</b> burns a one-time
              nullifier; scanning the same unit again will flag it as a possible counterfeit.
            </p>
          </div>
        </div>
      </Card>

      <Card className="span-2">
        {lastScan ? (
          <ScanVerdict
            result={lastScan}
            busy={!!busy}
            onDispense={() => void runScan(lastScan.unitCode, lastScan.batchId, true)}
          />
        ) : (
          <div className="empty" style={{ padding: 40 }}>
            No scan yet. The verdict — authentic, recalled, clone, not imported — will appear here.
          </div>
        )}
      </Card>

      <Card>
        <h3>
          <span className="glyph">◷</span> Recent scans
        </h3>
        <div className="list" style={{ marginTop: 12 }}>
          {history.length === 0 ? (
            <div className="empty">Scans this session appear here.</div>
          ) : (
            history.map((s, i) => (
              <div key={`${s.unitCode}-${i}`} className="list-row">
                <div className="grow">
                  <div className="nm mono">{s.unitCode}</div>
                  <div className="id">{s.batchId}</div>
                </div>
                <Pill tone={s.outcome === 'AUTHENTIC' ? 'ok' : 'bad'}>{s.outcome}</Pill>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <h3>
          <span className="glyph">🛡</span> Why it is private
        </h3>
        <p className="hint">
          The pharmacy proves it is registered with a Merkle membership proof; its identity is not
          written on-chain. The unit code is a witness, so it never enters the public proof preimage.
        </p>
        <div style={{ marginTop: 12 }} className="stack">
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
          <p className="hint" style={{ marginTop: 10 }}>
            Last nullifier <span className="mono">{shortHex(lastScan.nullifier, 10, 8)}</span>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
