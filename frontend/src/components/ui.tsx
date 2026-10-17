import { useState, type ReactNode } from 'react';
import type { TxStage } from '../lib/types';

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

const STAGE_ORDER: TxStage[] = ['building', 'proving', 'balancing', 'submitting', 'finalized'];

const STAGE_LABEL: Record<TxStage, string> = {
  idle: '',
  building: 'Building',
  proving: 'Proving',
  balancing: 'Wallet balancing',
  submitting: 'Submitting',
  finalized: 'Finalized',
  failed: 'Failed',
};

/** The transaction lifecycle, shown rather than hidden behind a spinner. */
export function StageMeter({ stage, note }: { stage: TxStage; note?: string }) {
  const failed = stage === 'failed';
  const current = STAGE_ORDER.indexOf(stage);
  return (
    <div className={`stage-meter${failed ? ' failed' : ''}`}>
      <div className="stage-track">
        {STAGE_ORDER.map((s, i) => {
          const state = failed && i >= Math.max(current, 0) ? 'todo' : i < current ? 'done' : i === current ? 'active' : 'todo';
          return (
            <div key={s} className={`stage ${state}`}>
              <span className="bead">{state === 'done' ? '✓' : state === 'active' ? <span className="spinner" /> : i + 1}</span>
              <span className="nm">{STAGE_LABEL[s]}</span>
            </div>
          );
        })}
      </div>
      {note ? <div className="stage-note">{note}</div> : null}
    </div>
  );
}

