import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A printable sheet of unit QR codes. The payload is the raw unit code, which
 * the scanner already accepts as typed input — a QR is just a faster path to
 * the same string, so nothing extra needs decoding.
 */
export function QrSheet({ batchId, codes }: { batchId: string; codes: string[] }) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const code of codes) {
        try {
          next[code] = await QRCode.toDataURL(code, { margin: 1, width: 264 });
        } catch {
          /* skip a code that cannot be rendered */
        }
      }
      if (!cancelled) setImages(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [codes]);

  if (codes.length === 0) {
    return (
      <div className="empty">
        No unit codes for this batch in this browser. The manufacturer's unit sheet is the source of
        truth — generate the batch from the device that created it.
      </div>
    );
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <span className="hint">
          Batch <span className="mono">{batchId}</span> · {codes.length} unit
          {codes.length === 1 ? '' : 's'}
        </span>
        <button className="btn small ghost" onClick={() => window.print()}>
          ⎙ Print sheet
        </button>
      </div>
      <div className="qr-sheet">
        {codes.map((code) => (
          <div key={code} className="qr-cell">
            {images[code] ? <img src={images[code]} alt={`QR code for unit ${code}`} /> : <div style={{ width: 132, height: 132 }} />}
            <div className="code mono">{code}</div>
          </div>
        ))}
      </div>
    </>
  );
}
