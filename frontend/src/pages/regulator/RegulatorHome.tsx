import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMedPass } from '../../contexts/useMedPass';
import { Card, Copy, KV, PageHeader, Pill, Section, Stat } from '../../components/ui';
import { ROLE_META } from '../../lib/roles';
import { ROUTES } from '../../lib/routes';
import { isHex32 } from '../../lib/identity';
import { shortHex, timeAgo } from '../../lib/format';
import type { Role } from '../../lib/types';

type ParticipantRole = Exclude<Role, 'regulator'>;

export function RegulatorHome() {
  const { ledger, identity, register, revoke, busy, pendingRequests, dismissRequest } = useMedPass();
  const [partyId, setPartyId] = useState('');
  const [role, setRole] = useState<ParticipantRole>('pharmacy');
  const idValid = isHex32(partyId);

  return (
    <>
      <PageHeader
        eyebrow="Regulator"
        title="The trust root, and the enrolment desk."
        accent="trust root"
        lede="The regulator is sealed into the contract at deploy and only it can enrol or revoke a party. Every other role must be enrolled here before it can act."
      />

      <Section title="Trust root" sub="sealed at deploy">
        <div className="grid auto-300">
          <Card>
            <div className="grid cols-2" style={{ marginBottom: 16 }}>
              <Stat n={ledger?.partyCount ?? 0} l="parties enrolled" />
              <Stat n={ledger?.revoked.length ?? 0} l="revoked" />
            </div>
            <KV k="registries" v="manufacturers · importers · pharmacies" mono={false} />
            <KV k="membership" v="Merkle proof, no id revealed" mono={false} />
            <KV k="revocation" v="leaf stays, becomes inert" mono={false} />
            <KV k="re-enrolment" v="clears the revocation" mono={false} />
          </Card>
          <Card className="span-2">
            <div className="row between">
              <div>
                <h3>This device</h3>
                <p className="hint" style={{ marginTop: 6 }}>
                  This browser's identity must itself be the sealed regulator for these actions to
                  prove. The contract reads the acting party from the{' '}
                  <span className="mono">caller_sk</span> witness, so the key here is what the
                  constructor sealed when the contract was deployed.
                </p>
              </div>
              <Pill tone="info">local only</Pill>
            </div>
            <KV k="participant id" v={shortHex(identity.participantId, 20, 12)} />
            <KV k="secret key" v="held in this browser only" mono={false} />
            <div className="row" style={{ marginTop: 16 }}>
              <Copy value={identity.participantId} label="Copy party id" />
              <Link className="btn small ghost" to={ROUTES.register}>
                Import or back up the key →
              </Link>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Enrolment requests" sub="raised from the register page">
        {pendingRequests.length === 0 ? (
          <Card>
            <p className="hint">
              No requests raised in this browser. Participants raise one on the{' '}
              <Link className="tx-link" to={ROUTES.register}>
                enrolment page
              </Link>
              ; it arrives here as a local handoff, since the contract has no on-chain inbox.
            </p>
          </Card>
        ) : (
          <Card>
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Participant id</th>
                  <th>Raised</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{ROLE_META[r.role].label}</td>
                    <td className="mono">{shortHex(r.partyId, 14, 10)}</td>
                    <td>{timeAgo(r.at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row tight" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn small" onClick={() => setPartyId(r.partyId)}>
                          Use id
                        </button>
                        <button
                          className="btn small primary"
                          disabled={!!busy}
                          onClick={() => {
                            void register(r.role, r.partyId).then(() => dismissRequest(r.id));
                          }}
                        >
                          Enrol
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section title="Enrol a party" sub="when the id arrives out of band">
        <Card>
          <p className="hint">
            Each entry commits a party id — the secret behind it never leaves its owner. Paste the id
            from a request string, or leave it blank to enrol this browser's own identity.
          </p>
          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="enrol-party-role">Role</label>
              <select id="enrol-party-role" value={role} onChange={(e) => setRole(e.target.value as ParticipantRole)}>
                <option value="manufacturer">Manufacturer</option>
                <option value="importer">Importer</option>
                <option value="pharmacy">Pharmacy</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="enrol-party-id">Party id</label>
              <input
                id="enrol-party-id"
                type="text"
                className="mono"
                value={partyId}
                placeholder={identity.participantId}
                onChange={(e) => setPartyId(e.target.value)}
              />
              <span className="help">Must be participant_id(secret) of the party.</span>
            </div>
          </div>
          <div className="row">
            <button
              className="btn primary"
              disabled={!!busy || (partyId.trim() !== '' && !idValid)}
              onClick={() => void register(role, partyId || undefined)}
            >
              {busy ? <span className="spinner" /> : '§'} Enrol {ROLE_META[role].label.toLowerCase()}
            </button>
            {partyId ? (
              <button className="btn ghost small" onClick={() => setPartyId('')}>
                Clear
              </button>
            ) : null}
            {partyId.trim() !== '' && !idValid ? (
              <span className="hint">That id is not 64 hex characters.</span>
            ) : null}
          </div>
        </Card>
      </Section>

      <Section title="Revoke a party" sub="strike off by id">
        <Card>
          <p className="hint">
            Revocation makes a party's leaf inert: its membership proofs stop verifying, so it can no
            longer create batches, record imports or dispense. The leaf is not deleted, so re-enrolling
            the same id from above restores it.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn danger"
              disabled={!!busy || !idValid}
              onClick={() => void revoke(partyId.trim())}
            >
              Revoke this party id
            </button>
            <span className="hint">Uses the id in the field above.</span>
          </div>
        </Card>
      </Section>

      <Section title="Registries" sub="self-status only">
        <Card>
          <p className="hint">
            A registry cannot be enumerated. It is a Merkle tree of leaf commitments, so the contract
            can prove a party is a member without ever listing its members. Each party checks its own
            status on the enrolment page; not even the regulator can dump the tree. To strike a party
            off, enrol or revoke it by id above.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn small ghost" to={ROUTES.register}>
              Open the enrolment page →
            </Link>
          </div>
        </Card>
      </Section>
    </>
  );
}
