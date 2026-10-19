import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMedPass } from '../contexts/useMedPass';
import { Banner, Card, Copy, KV, PageHeader, Pill, Section } from '../components/ui';
import { ROLE_META } from '../lib/roles';
import { ROUTES } from '../lib/routes';
import { shortHex, timeAgo } from '../lib/format';
import type { Role } from '../lib/types';

type ParticipantRole = Exclude<Role, 'regulator'>;
const ROLES: ParticipantRole[] = ['manufacturer', 'importer', 'pharmacy'];

/**
 * Enrolment is two-sided and this is the participant's half. `register_party`
 * is regulator-only, so a participant cannot enrol itself: it raises a request
 * here and the regulator approves it on their desk. The request lives in local
 * state because the contract has no on-chain inbox — the copyable string is the
 * real handoff, and it is labelled as such rather than dressed up as
 * chain-mediated.
 */
export function Register() {
  const {
    identity,
    enrolment,
    pendingRequests,
    requestEnrolment,
    dismissRequest,
    register,
    busy,
    importKey,
    regenerate,
  } = useMedPass();
  const [params, setParams] = useSearchParams();
  const initial = (params.get('role') as ParticipantRole | null) ?? 'pharmacy';
  const [role, setRole] = useState<ParticipantRole>(ROLES.includes(initial) ? initial : 'pharmacy');
  const [pastedKey, setPastedKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);

  const status = enrolment(role);
  const partyId = identity.participantId;
  const pending = pendingRequests.find((r) => r.role === role && r.partyId === partyId);
  const requestString = `medpass:enrol role=${role} party=${partyId}`;

  const applyKey = () => {
    try {
      importKey(pastedKey);
      setPastedKey('');
      setKeyError(null);
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Enrolment"
        title="Ask the regulator to enrol this identity."
        accent="enrol"
        lede="The regulator is sealed into the contract at deploy and only it can enrol or revoke a party. Pick a role, raise a request, and the regulator approves it on their desk."
      />

      <Section title="The party that acts" sub="this device's identity">
        <Card>
          <KV k="participant id" v={shortHex(partyId, 20, 12)} />
          <KV k="acting as" v={identity.label} mono={false} />
          <div className="row" style={{ marginTop: 16 }}>
            <Copy value={partyId} label="Copy party id" />
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            The contract reads the acting party from the <span className="mono">caller_sk</span>{' '}
            witness. Your wallet never reveals its secret key, so MedPass keeps its own 32-byte key in
            this browser and the regulator enrols <span className="mono">participant_id(secret)</span>.
            That same key is what the contract seals as the regulator if you deploy.
          </p>
        </Card>
      </Section>

      <Section title="Regulator key" sub="import or generate">
        <Card>
          <p className="hint">
            Whoever's key deploys the contract becomes the regulator — the constructor seals{' '}
            <span className="mono">participant_id(caller_sk())</span> and nothing can change it
            afterwards. Import the key you want to hold that authority, or generate a fresh one before
            you deploy.
          </p>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="import-key">Import a secret key</label>
            <input
              id="import-key"
              type="text"
              className="mono"
              value={pastedKey}
              placeholder="64 hex characters"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setPastedKey(e.target.value);
                setKeyError(null);
              }}
            />
            <span className="help">
              The 32-byte key, hex. This replaces the key in this browser — it cannot be undone except
              by importing the old key back.
            </span>
          </div>
          {keyError ? <Banner tone="warn" title="Not a valid key">{keyError}</Banner> : null}
          <div className="row">
            <button className="btn primary" disabled={!pastedKey.trim()} onClick={applyKey}>
              Import key
            </button>
            <button className="btn ghost" onClick={regenerate}>
              Generate a new key
            </button>
          </div>
          <details className="tech">
            <summary>Back up the current key</summary>
            <div style={{ marginTop: 8 }}>
              <KV k="secret key" v={shortHex(identity.secretKey, 12, 8)} />
              <KV k="participant id" v={shortHex(identity.participantId, 12, 8)} />
              <div className="row" style={{ marginTop: 8 }}>
                <Copy value={identity.secretKey} label="Copy secret key" />
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Keep this out of shared channels. Anyone holding it can act as this identity, and the
                regulator's key cannot be recovered or replaced once a contract is deployed.
              </p>
            </div>
          </details>
        </Card>
      </Section>

      <Section title="Request" sub="one role at a time">
        <div className="grid auto-300">
          <Card>
            <div className="field">
              <label htmlFor="enrol-role">Role</label>
              <select
                id="enrol-role"
                value={role}
                onChange={(e) => {
                  const next = e.target.value as ParticipantRole;
                  setRole(next);
                  setParams({ role: next });
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_META[r].label}
                  </option>
                ))}
              </select>
              <span className="help">{ROLE_META[role].blurb}</span>
            </div>

            <div className="row tight" style={{ marginBottom: 16 }}>
              <span className="caption muted" style={{ textTransform: 'uppercase' }}>
                Status
              </span>
              {status.enrolled && !status.revoked ? (
                <Pill tone="ok">active</Pill>
              ) : status.revoked ? (
                <Pill tone="bad">revoked</Pill>
              ) : pending ? (
                <Pill tone="info">requested</Pill>
              ) : (
                <Pill tone="neutral">not enrolled</Pill>
              )}
            </div>

            {status.enrolled && !status.revoked ? (
              <Banner tone="info" title="Already enrolled">
                This identity can act as a {ROLE_META[role].label.toLowerCase()}. Nothing to do here.
              </Banner>
            ) : status.revoked ? (
              <Banner
                tone="warn"
                title="Revoked — you can ask to be restored"
                action={
                  <button className="btn primary small" disabled={!!busy} onClick={() => void register(role, partyId)}>
                    Restore access
                  </button>
                }
              >
                Re-enrolment restores a revoked party: the contract removes the leaf from the revoked
                set. A revoked party cannot enrol itself, so the regulator must approve.
              </Banner>
            ) : pending ? (
              <Banner
                tone="info"
                title="Request raised"
                action={
                  <button className="btn small ghost" onClick={() => dismissRequest(pending.id)}>
                    Withdraw
                  </button>
                }
              >
                Raised {timeAgo(pending.at)}. The regulator approves it from their desk.
              </Banner>
            ) : (
              <button
                className="btn primary"
                disabled={!!busy}
                onClick={() => requestEnrolment(role, identity.label)}
              >
                Request enrolment
              </button>
            )}
          </Card>

          <Card className="span-2">
            <h3>Hand the request over</h3>
            <p className="hint" style={{ marginTop: 6 }}>
              There is no on-chain inbox — <span className="mono">register_party</span> is the only
              enrolment entry point and it is regulator-only. So the request is local to this browser
              and this string is what you send the regulator out of band. They paste the party id into
              their enrolment form.
            </p>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="request-string">Request string</label>
              <input id="request-string" className="mono" readOnly value={requestString} />
            </div>
            <div className="row">
              <Copy value={requestString} label="Copy request" />
              <Copy value={partyId} label="Copy party id" />
              <Link className="btn small ghost" to={ROUTES.regulator}>
                Go to the regulator desk →
              </Link>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Why it works this way" sub="the trust root">
        <Card>
          <div className="grid cols-3">
            <div>
              <Pill tone="info">sealed</Pill>
              <p className="hint" style={{ marginTop: 10 }}>
                The regulator's id is written once in the constructor and never reassigned. No one,
                including the regulator, can swap the trust root.
              </p>
            </div>
            <div>
              <Pill tone="ok">proved</Pill>
              <p className="hint" style={{ marginTop: 10 }}>
                Every later action proves registry membership with a private Merkle path. A party id
                never appears in a proof's public inputs.
              </p>
            </div>
            <div>
              <Pill tone="neutral">reversible</Pill>
              <p className="hint" style={{ marginTop: 10 }}>
                Revocation makes a leaf inert without deleting it. Re-enrolling the same party clears
                the revocation.
              </p>
            </div>
          </div>
        </Card>
      </Section>
    </>
  );
}
