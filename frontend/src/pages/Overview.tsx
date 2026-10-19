import { useMedPass } from '../contexts/useMedPass';
import { ActivityFeed } from '../components/ActivityFeed';
import { Banner, Card, Copy, KV, PageHeader, Pill, Section, Stat } from '../components/ui';
import { BatchTable } from '../components/tables';
import { NETWORKS } from '../lib/network';
import { ROUTES } from '../lib/routes';
import { shortHex } from '../lib/format';
import { Link } from 'react-router-dom';

export function Overview() {
  const mp = useMedPass();
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Contract state and activity."
        accent="activity"
        lede="What is actually on-chain right now, what this browser holds, and every transaction this session has produced."
      />

      {!mp.wallet.connected ? (
        <div className="section">
          <Banner tone="warn" title="Connect a Midnight wallet to begin">
            Install Lace (Midnight edition) or 1AM, then connect. The wallet pays DUST fees and submits
            transactions; the app's own identity signs the contract call.
          </Banner>
        </div>
      ) : null}

      <Section title="Contract" sub="the shared ledger">
        <div className="grid auto-300">
          <Card>
            <div className="grid cols-2" style={{ marginBottom: 16 }}>
              <Stat n={mp.ledger?.batchCount ?? 0} l="batches" />
              <Stat n={mp.ledger?.partyCount ?? 0} l="parties enrolled" />
            </div>
            <KV k="address" v={shortHex(mp.contractAddress, 12, 10)} />
            <KV k="network" v={NETWORKS[mp.networkId]?.label ?? mp.networkId} mono={false} />
            <KV k="dispensed" v={String(mp.ledger?.dispensed.length ?? 0)} />
            <div className="row" style={{ marginTop: 16 }}>
              <Copy value={mp.contractAddress} label="Copy address" />
              <button className="btn small ghost" onClick={mp.refresh}>
                ↻ Refresh
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="field">
                <label htmlFor="join-address">Contract address</label>
                <input
                  id="join-address"
                  type="text"
                  className="mono"
                  value={mp.contractAddress}
                  onChange={(e) => mp.setContractAddress(e.target.value)}
                  placeholder="contract address"
                />
              </div>
              <div className="row">
                <button className="btn small" disabled={!!mp.busy} onClick={() => void mp.join(mp.contractAddress)}>
                  Join
                </button>
                <button className="btn small primary" disabled={!!mp.busy} onClick={() => void mp.deploy()}>
                  Deploy new
                </button>
              </div>
              <p className="hint" style={{ marginTop: 12 }}>
                Joining the deployed contract uses it as-is. Deploying a new one seals{' '}
                <span className="mono">participant_id(caller_sk())</span> of the key held in this
                browser — that key becomes the regulator, and the choice cannot be undone.
              </p>
            </div>
          </Card>

          <Card className="span-2">
            <ActivityFeed items={mp.activity} onClear={mp.clearActivity} />
          </Card>
        </div>
      </Section>

      <Section
        title="Batches"
        sub="one Merkle root each"
        right={
          <Link className="btn small ghost" to={ROUTES.manufacturer}>
            Manufacturer →
          </Link>
        }
      >
        <Card>
          <BatchTable batches={mp.batches} linkTo={(b) => ROUTES.batch(b.id)} empty="No batches on-chain yet." />
        </Card>
      </Section>

      <Section title="Identity" sub="the app's own keypair">
        <Card>
          <div className="row between">
            <div>
              <h3>Device identity</h3>
              <p className="hint" style={{ marginTop: 6 }}>
                The contract identifies the acting party from the <span className="mono">caller_sk</span>{' '}
                witness. Wallets never reveal that secret, so the app keeps its own key in this browser
                and the regulator enrols <span className="mono">participant_id(secret)</span>.
              </p>
            </div>
            <Pill tone="info">local only</Pill>
          </div>
          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <div>
              <KV k="participant id" v={shortHex(mp.identity.participantId, 16, 12)} />
              <KV k="secret key" v="held in this browser only" mono={false} />
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Copy value={mp.identity.participantId} label="Copy party id" />
              <Link className="btn small ghost" to={ROUTES.register}>
                Import / back up →
              </Link>
              <button className="btn small ghost" onClick={mp.regenerate}>
                Regenerate
              </button>
            </div>
          </div>
        </Card>
      </Section>
    </>
  );
}
