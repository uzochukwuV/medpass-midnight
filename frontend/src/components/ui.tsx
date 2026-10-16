import { useState, type ReactNode } from 'react';

export function Card({ children, className = '', pad = false }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={`card${pad ? ' pad-lg' : ''} ${className}`.trim()}>{children}</div>;
}

export function Section({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {sub ? <span className="sub">{sub}</span> : null}
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </section>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function KV({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v${mono ? ' mono' : ''}`}>{v}</span>
    </div>
  );
}

export function Stat({ n, l }: { n: ReactNode; l: string }) {
  return (
    <div className="stat">
      <span className="n">{n}</span>
      <span className="l">{l}</span>
    </div>
  );
}

export function Copy({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

export function Banner({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad'; title: string; children?: ReactNode }) {
  return (
    <div className={`banner${tone === 'info' ? '' : ` ${tone}`}`}>
      <div className="body">
        <b>{title}</b>
        {children ? <span>{children}</span> : null}
      </div>
    </div>
  );
}
