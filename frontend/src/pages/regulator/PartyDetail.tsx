import { Link, useParams } from 'react-router-dom';
import { useMedPass } from '../../contexts/useMedPass';
import { Card, KV, PageHeader, Pill, Section } from '../../components/ui';
import { ROLE_META } from '../../lib/personas';
import { ROUTES } from '../../lib/routes';
import { shortHex } from '../../lib/format';

export function PartyDetail() {
  const { partyId = '' } = useParams();
  const { ledger, revoke, reRegister, busy } = useMedPass();

  const rows = [...(ledger?.manufacturers ?? []), ...(ledger?.importers ?? []), ...(ledger?.pharmacies ?? [])];
  const party = rows.find((p) => p.id === partyId);

  if (!party) {
    return (
      <>
        <PageHeader eyebrow="Regulator · party" title="Party not found." accent="not found" />
        <Card>
          <p className="hint">
            No party <span className="mono">{partyId}</span> is listed. Live registries cannot be
            enumerated, so this page only works where the cast is known.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn small ghost" to={ROUTES.regulator}>
              ← Back to the desk
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`Regulator · ${ROLE_META[party.role].label.toLowerCase()}`}
        title={party.label}
        right={<Pill tone={party.revoked ? 'bad' : 'ok'}>{party.revoked ? 'revoked' : 'active'}</Pill>}
      />

      <Section title="Party" sub="registry entry">
        <Card>
          <KV k="role" v={ROLE_META[party.role].label} mono={false} />
          <KV k="participant id" v={shortHex(party.participantId, 24, 16)} />
          <KV k="leaf" v="a commitment — the id is not recoverable from it" mono={false} />
          <div className="row" style={{ marginTop: 16 }}>
            {party.revoked ? (
              <button className="btn small primary" disabled={!!busy} onClick={() => reRegister(party.id)}>
                Restore
              </button>
            ) : (
              <button className="btn small danger" disabled={!!busy} onClick={() => revoke(party.id)}>
                Revoke
              </button>
            )}
            <Link className="btn small ghost" to={ROUTES.regulator}>
              ← Back to the desk
            </Link>
          </div>
        </Card>
      </Section>

      <Section title="What revocation does" sub="and does not do">
        <Card>
          <p className="hint">
            Revocation makes the party's leaf inert: membership proofs against it stop verifying, so the
            party can no longer create batches, record imports or dispense. The leaf is not deleted, so
            re-enrolling the same party restores it. Batches the party already created are unaffected —
            a recall is the tool for those.
          </p>
        </Card>
      </Section>
    </>
  );
}
