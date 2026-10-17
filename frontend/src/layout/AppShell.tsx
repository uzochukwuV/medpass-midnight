import { Outlet } from 'react-router-dom';
import { useMedPass } from '../contexts/useMedPass';
import { NavBar, StatusStrip } from './NavBar';
import { StageMeter } from '../components/ui';

/** The workspace chrome: nav, orientation strip, routed page, stage meter. */
export function AppShell() {
  const { busy, stage, mode } = useMedPass();
  return (
    <div>
      <NavBar />
      <StatusStrip />
      {busy ? (
        <div className="status-strip">
          <div className="status-strip-inner">
            <span className="spinner" />
            <span>
              <b>{busy}</b>
            </span>
            <span>{mode === 'live' ? 'proving and submitting…' : 'running the circuit…'}</span>
          </div>
        </div>
      ) : null}
      <main className="page">
        <Outlet />
      </main>
      {stage !== 'idle' ? <StageMeter stage={stage} note={busy ?? undefined} /> : null}
    </div>
  );
}
