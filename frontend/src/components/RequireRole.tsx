import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMedPass } from '../contexts/useMedPass';
import { EmptyState, Pill } from './ui';
import { ROUTES } from '../lib/routes';
import type { Role } from '../lib/types';

type ParticipantRole = Exclude<Role, 'regulator'>;

/**
 * Gates a role's pages on enrolment. The check runs before the user acts, so a
 * missing enrolment reads as an explanation with a way forward rather than a
 * failed transaction.
 */
export function RequireRole({ role, children }: { role: ParticipantRole; children: ReactNode }) {
  const { enrolment } = useMedPass();
  const status = enrolment(role);

  if (!status.enrolled || status.revoked) {
    const revoked = status.revoked;
    return (
      <div className="section">
        <EmptyState
          title={revoked ? 'This identity has been revoked' : 'This identity is not enrolled yet'}
          action={
            <Link className="btn primary" to={`${ROUTES.register}?role=${role}`}>
              {revoked ? 'Restore access' : 'Request enrolment'}
            </Link>
          }
        >
          {revoked
            ? 'The regulator struck this party off, so its proofs no longer verify. Re-enrolment restores it — the contract removes the leaf from the revoked set.'
            : 'The regulator must enrol a party before it can create batches, record imports or dispense. Raise a request and the regulator approves it.'}
        </EmptyState>
      </div>
    );
  }

  return <>{children}</>;
}

/** Enrolment status for the acting party, shown on each role home. */
export function EnrolmentPanel({ role }: { role: ParticipantRole }) {
  const { enrolment, identity, mode } = useMedPass();
  const status = enrolment(role);
  const state = !status.enrolled ? 'not enrolled' : status.revoked ? 'revoked' : 'active';
  const tone = state === 'active' ? 'ok' : state === 'revoked' ? 'bad' : 'neutral';

  return (
    <div className="row between">
      <div>
        <div className="row tight">
          <span className="caption muted" style={{ textTransform: 'uppercase' }}>
            Enrolment
          </span>
          <Pill tone={tone}>{state}</Pill>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          {mode === 'demo'
            ? 'Demo mode acts as a fixed persona, so its status comes from the local ledger.'
            : 'Your own status only — the registry cannot be enumerated by design.'}
        </div>
        <div className="mono small muted" style={{ marginTop: 4 }}>
          {identity.participantId.slice(0, 20)}…
        </div>
      </div>
      <Link className="btn small ghost" to={`${ROUTES.register}?role=${role}`}>
        {state === 'active' ? 'View enrolment' : state === 'revoked' ? 'Restore access' : 'Request enrolment'}
      </Link>
    </div>
  );
}
