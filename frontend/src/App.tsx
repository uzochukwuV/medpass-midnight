import { useState } from 'react';
import { useMedPass } from './contexts/useMedPass';
import { ActivityFeed } from './components/ActivityFeed';
import { Banner, Card, Copy, KV, Pill, Section } from './components/ui';
import { RegulatorScreen } from './screens/RegulatorScreen';
import { ManufacturerScreen } from './screens/ManufacturerScreen';
import { ImporterScreen } from './screens/ImporterScreen';
import { PharmacyScreen } from './screens/PharmacyScreen';
import { ROLE_META } from './lib/personas';
import { NETWORKS } from './lib/network';
import { shortHex } from './lib/format';
import type { Role } from './lib/types';

const ROLES: Role[] = ['regulator', 'manufacturer', 'importer', 'pharmacy'];

export function App() {
  const mp = useMedPass();
  const [role, setRole] = useState<Role>('pharmacy');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">✚</span>
          <div>
            <div className="name">MedPass</div>
            <div className="tag">zero-knowledge medicine passport</div>
          </div>
        </div>
        <span className="spacer" />

        <div className="mode-toggle" role="tablist" aria-label="Run mode">
          <button aria-pressed={mp.mode === 'demo'} onClick={() => mp.setMode('demo')}>
            Demo
          </button>
          <button aria-pressed={mp.mode === 'live'} onClick={() => mp.setMode('live')}>
            Live
          </button>
        </div>

        {mp.mode === 'live' ? (
          <select className="net-select" value={mp.networkId} onChange={(e) => mp.setNetworkId(e.target.value)}>
            {Object.values(NETWORKS).map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        ) : null}

        <WalletBar />
      </header>

      <main>
        <section className="hero">
          <h1>Scan a medicine. Get a proof, not a promise.</h1>
          <p className="lede">
            Every batch carries a cryptographic id. A pharmacist scans a unit and receives a
            zero-knowledge verdict — made by the stated company, imported through an authorized
            channel, not recalled — while supplier contracts and pricing stay sealed.
          </p>
          <div className="chips">
            <span className="chip brandish">
              <span className="dot" /> {mp.mode === 'demo' ? 'Demo — real circuits, in-browser' : 'Live — wallet + prover'}
            </span>
            <span className="chip">{mp.mode === 'live' ? NETWORKS[mp.networkId]?.label ?? mp.networkId : 'no network needed'}</span>
            <span className="chip">
              {mp.ledger?.batchCount ?? 0} batches · {mp.ledger?.partyCount ?? 0} parties
            </span>
            <span className="chip">{mp.ledger?.dispensed.length ?? 0} dispensed</span>
          </div>
        </section>

        {mp.mode === 'live' && !mp.wallet.connected ? (
          <div className="section">
            <Banner tone="warn" title="Live mode needs a Midnight wallet">
              Install Lace (Midnight edition) or 1AM, then connect. The wallet pays DUST fees and
              submits transactions; the app's own identity signs the contract call.
            </Banner>
          </div>
        ) : null}

        {mp.mode === 'demo' ? (
          <div className="section">
            <Banner tone="info" title="Demo mode runs the real contract">
              No wallet, node or prover required. The compiled Compact circuits execute in your
              browser through the Midnight simulator, so the verdicts and clone detection you see are
              produced by the actual contract logic.
            </Banner>
          </div>
        ) : null}

        <Section
          title="Workspace"
          sub="Four roles, one contract"
          right={
            <span className="muted small">
              contract <span className="mono">{shortHex(mp.contractAddress, 10, 8)}</span>
            </span>
          }
        >
          <div className="roletabs" role="tablist" aria-label="Role">
            {ROLES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={role === r}
                className="roletab"
                onClick={() => setRole(r)}
              >
                <span className="glyph">{ROLE_META[r].glyph}</span>
                <span className="meta">
                  <b>{ROLE_META[r].label}</b>
                  <span>{ROLE_META[r].blurb.split(' ').slice(0, 4).join(' ')}…</span>
                </span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            {role === 'regulator' ? <RegulatorScreen /> : null}
            {role === 'manufacturer' ? <ManufacturerScreen /> : null}
            {role === 'importer' ? <ImporterScreen /> : null}
            {role === 'pharmacy' ? <PharmacyScreen /> : null}
          </div>
        </Section>

        <Section title="Session" sub="contract & activity">
          <div className="grid auto-300">
            <Card>
              <h3>
                <span className="glyph">⛓</span> Contract
              </h3>
              <div style={{ marginTop: 12 }}>
                <KV k="address" v={shortHex(mp.contractAddress, 12, 10)} />
                <KV k="mode" v={mp.mode} mono={false} />
                <KV k="batches" v={String(mp.ledger?.batchCount ?? 0)} />
                <KV k="parties" v={String(mp.ledger?.partyCount ?? 0)} />
                <KV k="dispensed" v={String(mp.ledger?.dispensed.length ?? 0)} />
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <Copy value={mp.contractAddress} label="Copy address" />
                <button className="btn small ghost" onClick={mp.refresh}>
                  ↻ Refresh
                </button>
              </div>
              {mp.mode === 'live' ? (
                <div className="field" style={{ marginTop: 14 }}>
                  <label>Join another contract</label>
                  <input
                    type="text"
                    className="mono"
                    value={mp.contractAddress}
                    onChange={(e) => mp.setContractAddress(e.target.value)}
                    placeholder="contract address"
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn small" disabled={!!mp.busy} onClick={() => void mp.join(mp.contractAddress)}>
                      Join
                    </button>
                    <button className="btn small primary" disabled={!!mp.busy} onClick={() => void mp.deploy()}>
                      Deploy new
                    </button>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="span-2">
              <ActivityFeed items={mp.activity} onClear={mp.clearActivity} />
            </Card>
          </div>
        </Section>

        <Section title="Identity" sub="the app's own keypair">
          <Card>
            <div className="row between">
              <div>
                <h3>
                  <span className="glyph">🔑</span> Device identity
                </h3>
                <p className="hint">
                  The contract identifies the acting party from the <span className="mono">caller_sk</span>{' '}
                  witness. Wallets never reveal that secret, so the app keeps its own key in this
                  browser and the regulator enrols <span className="mono">participant_id(secret)</span>.
                </p>
              </div>
              <Pill tone="info">local only</Pill>
            </div>
            <div className="grid cols-2" style={{ marginTop: 14 }}>
              <div>
                <KV k="participant id" v={shortHex(mp.identity.participantId, 16, 12)} />
                <KV k="secret key" v="never leaves this browser" mono={false} />
              </div>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <Copy value={mp.identity.participantId} label="Copy party id" />
                <button className="btn small ghost" onClick={mp.regenerate}>
                  Regenerate
                </button>
              </div>
            </div>
          </Card>
        </Section>
      </main>

      {mp.busy ? (
        <div className="busy-bar">
          <span className="spinner" />
          <span className="label">{mp.busy}</span>
          <span className="muted small">
            {mp.mode === 'live' ? 'proving and submitting…' : 'running the circuit…'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function WalletBar() {
  const { mode, wallet, connect, disconnect } = useMedPass();
  if (mode === 'demo') {
    return (
      <span className="wallet-chip">
        <span className="dot" />
        <span className="addr">demo identity</span>
      </span>
    );
  }
  if (!wallet.connected) {
    return (
      <button className="btn primary small" disabled={wallet.connecting} onClick={() => void connect()}>
        {wallet.connecting ? <span className="spinner" /> : '⬡'} {wallet.available ? 'Connect wallet' : 'Install a wallet'}
      </button>
    );
  }
  return (
    <button className="wallet-chip on" onClick={disconnect} title="Click to disconnect">
      <span className="dot" />
      <span className="addr mono">{shortHex(wallet.address, 8, 6)}</span>
    </button>
  );
}
