import { Link, NavLink } from 'react-router-dom';
import { useMedPass } from '../contexts/useMedPass';
import { WalletBar } from './WalletBar';
import { NETWORKS } from '../lib/network';
import { ROUTES, ROLE_NAV } from '../lib/routes';
import { shortHex } from '../lib/format';

/** Borderless top bar: logo left, role links centre-right, mode + wallet right. */
export function NavBar() {
  const { mode, setMode, networkId, setNetworkId } = useMedPass();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to={ROUTES.landing} className="brand">
          <span className="mark" aria-hidden="true">
            ✚
          </span>
          <span>
            <span className="name">MedPass</span>
            <span className="tag" style={{ display: 'block' }}>
              zero-knowledge medicine passport
            </span>
          </span>
        </Link>

        <nav className="nav" aria-label="Roles">
          {ROLE_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
          <NavLink to={ROUTES.overview} className={({ isActive }) => (isActive ? 'active' : '')}>
            Overview
          </NavLink>
        </nav>

        <div className="row tight">
          <div className="mode-toggle" role="group" aria-label="Run mode">
            <button aria-pressed={mode === 'demo'} onClick={() => setMode('demo')}>
              Demo
            </button>
            <button aria-pressed={mode === 'live'} onClick={() => setMode('live')}>
              Live
            </button>
          </div>
          {mode === 'live' ? (
            <select
              className="small"
              style={{ width: 'auto' }}
              value={networkId}
              onChange={(e) => setNetworkId(e.target.value)}
              aria-label="Network"
            >
              {Object.values(NETWORKS).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          ) : null}
          <WalletBar />
        </div>
      </div>
    </header>
  );
}

/** One line of orientation, always visible: mode, network, contract, counts. */
export function StatusStrip() {
  const { mode, networkId, ledger, contractAddress } = useMedPass();
  return (
    <div className="status-strip">
      <div className="status-strip-inner">
        <span>
          <b>{mode === 'demo' ? 'Demo' : 'Live'}</b>
          {mode === 'demo' ? ' — real circuits, in-browser' : ` — ${NETWORKS[networkId]?.label ?? networkId}`}
        </span>
        <span>·</span>
        <span>
          <b>{ledger?.batchCount ?? 0}</b> batches
        </span>
        <span>·</span>
        <span>
          <b>{ledger?.dispensed.length ?? 0}</b> dispensed
        </span>
        <span>·</span>
        <span className="mono">contract {shortHex(contractAddress, 10, 8)}</span>
      </div>
    </div>
  );
}
