import { useState } from 'react';
import { useMedPass } from '../contexts/useMedPass';
import { NETWORKS } from '../lib/network';
import { shortHex } from '../lib/format';

function formatDust(v: bigint): string {
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  return frac === 0n
    ? whole.toLocaleString()
    : `${whole.toLocaleString()}.${String(frac).padStart(6, '0').slice(0, 2)}`;
}

export function WalletBar() {
  const { mode, wallet, wallets, connect, disconnect, balances, networkId } = useMedPass();
  const [picking, setPicking] = useState(false);

  if (mode === 'demo') {
    return (
      <span className="chip">
        <span className="dot" />
        demo identity
      </span>
    );
  }

  if (!wallet.connected) {
    const usable = wallets.filter((w) => /^4\./.test(w.apiVersion));
    return (
      <div className="wallet-bar">
        <button
          className="btn primary small"
          disabled={wallet.connecting}
          onClick={() => (usable.length > 1 ? setPicking((p) => !p) : void connect(usable[0]?.key))}
        >
          {wallet.connecting ? <span className="spinner" /> : '⬡'}{' '}
          {wallets.length === 0 ? 'Install a wallet' : usable.length > 1 ? 'Choose wallet' : 'Connect wallet'}
        </button>
        {picking && usable.length > 1 ? (
          <div className="wallet-menu">
            {usable.map((w) => (
              <button
                key={w.key}
                className="wallet-row btn ghost"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  setPicking(false);
                  void connect(w.key);
                }}
              >
                {w.icon ? <img src={w.icon} alt="" width={16} height={16} /> : null}
                <span className="grow" style={{ textAlign: 'left' }}>
                  {w.name}
                </span>
                <span className="muted small">{w.apiVersion}</span>
              </button>
            ))}
          </div>
        ) : null}
        {wallet.error ? <div className="hint" style={{ color: 'var(--ink)' }}>{wallet.error}</div> : null}
      </div>
    );
  }

  const dust = balances?.dust;
  const faucet = NETWORKS[networkId]?.faucet;
  return (
    <div className="wallet-bar">
      <button className="chip" onClick={disconnect} title="Click to disconnect">
        <span className="dot" />
        <span className="mono">{shortHex(wallet.address, 8, 6)}</span>
      </button>
      <span className="muted small">
        {dust ? (dust.balance > 0n ? `${formatDust(dust.balance)} DUST` : 'no DUST') : wallet.walletName}
      </span>
      {dust && dust.balance === 0n && faucet ? (
        <a className="tx-link small" href={faucet} target="_blank" rel="noreferrer">
          get tNIGHT ↗
        </a>
      ) : null}
    </div>
  );
}
