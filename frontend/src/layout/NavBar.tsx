import { Link, NavLink } from 'react-router-dom';
import { useMedPass } from '../contexts/useMedPass';
import { WalletBar } from './WalletBar';
import { NETWORKS } from '../lib/network';
import { ROUTES, ROLE_NAV } from '../lib/routes';
import { shortHex } from '../lib/format';

/** Borderless top bar: logo left, role links centre-right, network + wallet right. */
export function NavBar() {
  const { networkId, setNetworkId } = useMedPass();
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
          <WalletBar />
        </div>
      </div>
    </header>
  );
}

/** One line of orientation, always visible: network, contract, counts. */
export function StatusStrip() {
  const { networkId, ledger, contractAddress } = useMedPass();
  return (
    <div className="status-strip">
      <div className="status-strip-inner">
        <span>
          <b>{NETWORKS[networkId]?.label ?? networkId}</b>
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
