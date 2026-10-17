import { Link } from 'react-router-dom';
import { useMedPass } from '../../contexts/useMedPass';
import { Card, EmptyState, PageHeader, Section } from '../../components/ui';
import { VerdictCard } from '../../components/VerdictCard';
import { ROUTES } from '../../lib/routes';
import { clockTime } from '../../lib/format';

export function ScanHistory() {
  const { scans, busy, scan } = useMedPass();
  const dispensed = scans.filter((s) => s.outcome === 'AUTHENTIC');

  return (
    <>
      <PageHeader
        eyebrow="Pharmacy · history"
        title="Every scan this browser has run."
        accent="Every scan"
        lede="Kept locally, newest first. Nothing here is on-chain except the nullifier a dispense burns."
        right={
          <Link className="btn small ghost" to={ROUTES.pharmacy}>
            ← Counter
          </Link>
        }
      />

      <Section title="Scans" sub={`${scans.length} recorded`}>
        {scans.length === 0 ? (
          <Card>
            <EmptyState title="No scans yet">
              Scans run from the counter page appear here, with their outcome and the time they ran.
            </EmptyState>
          </Card>
        ) : (
          <div className="grid auto-300">
            {scans.map((s, i) => (
              <VerdictCard
                key={`${s.unitCode}-${i}`}
                result={s}
                busy={!!busy}
                action={<span className="caption muted">{clockTime(s.at)}</span>}
                onDispense={
                  dispensed.some((d) => d.unitCode === s.unitCode) ? undefined : () => void scan(s.batchId, s.unitCode, true)
                }
              />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
