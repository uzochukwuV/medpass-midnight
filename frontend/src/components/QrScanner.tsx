import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const ELEMENT_ID = 'medpass-qr-reader';

/**
 * Camera scanner for unit QR codes. html5-qrcode owns a DOM node we hand it, so
 * the video lifecycle is managed imperatively; `onResult` is held in a ref so a
 * parent re-render does not tear the camera down.
 */
export function QrScanner({ active, onResult }: { active: boolean; onResult: (text: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const resultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    setError(null);
    setStarting(true);

    const scanner = new Html5Qrcode(ELEMENT_ID, { verbose: false });
    scannerRef.current = scanner;

    (async () => {
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw new Error('No camera found on this device.');
        const back = cameras.find((c) => /back|rear|environment/i.test(c.label)) ?? cameras[cameras.length - 1];
        await scanner.start(
          { deviceId: { exact: back.id } },
          { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
          (decoded) => resultRef.current(decoded),
          () => undefined,
        );
        if (!cancelled) setStarting(false);
      } catch (e) {
        if (!cancelled) {
          setStarting(false);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => undefined);
      }
    };
  }, [active]);

  return (
    <div className="scanner-frame">
      <div id={ELEMENT_ID} ref={hostRef} style={{ width: '100%' }} />
      {active && !error ? <div className="reticle" /> : null}
      {!active ? <div className="placeholder">Camera is off. Start the scanner to read a unit QR code.</div> : null}
      {active && starting ? <div className="placeholder">Starting camera…</div> : null}
      {error ? (
        <div className="placeholder">
          Camera unavailable — {error}
          <br />
          You can still type the unit code below.
        </div>
      ) : null}
    </div>
  );
}
