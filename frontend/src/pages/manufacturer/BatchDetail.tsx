import { Link, useParams } from 'react-router-dom';
import { useMedPass } from '../../contexts/useMedPass';
import { Card, KV, PageHeader, Pill, Section } from '../../components/ui';
import { QrSheet } from '../../components/QrSheet';
import { localUnitCodes } from '../../lib/live';
import { ROUTES } from '../../lib/routes';
import { formatExpiry, isExpired, shortHex } from '../../lib/format';

export function BatchDetail() {
  const { batchId = '' } = useParams();
  const { batches, recall, busy } = useMedPass();
  const batch = batches.find((b) => b.id === batchId);
  const codes = localUnitCodes(batchId);

  if (!batch) {
    return (
      <>
        <PageHeader eyebrow="Manufacturer" title="Batch not found." accent="not found" />
        <Card>
          <p className="hint">
            No batch <span className="mono">{batchId}</span> is on-chain. It may not have been created
            yet, or this browser is pointed at a different contract.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn small ghost" to={ROUTES.manufacturer}>
              ← Back to batches
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Manufacturer · batch"
        title={batch.id}
        lede="The unit sheet and the recall control for this batch. Only the Merkle root is public; the codes below never leave this browser."
        right={
          <div className="row tight">
            <Pill tone={batch.status === 'RECALLED' ? 'bad' : 'ok'}>{batch.status}</Pill>
            <Pill tone={batch.imported ? 'info' : 'neutral'}>{batch.imported ? 'imported' : 'not imported'}</Pill>
          </div>
        }
      />

      <Section title="Record" sub="what the ledger holds">
        <Card>
          <KV k="manufacturer" v={shortHex(batch.manufacturer, 16, 12)} />
          <KV k="expiry" v={`${formatExpiry(batch.expiry)}${isExpired(batch.expiry) ? ' — past' : ''}`} />
          <KV k="units root" v={shortHex(batch.unitsRoot, 20, 12)} />
          <KV k="metadata hash" v={shortHex(batch.metadataHash, 20, 12)} />
          <KV k="terms commitment" v={batch.termsCommitment ? shortHex(batch.termsCommitment, 20, 12) : 'not imported'} />
          <KV k="units known here" v={codes.length ? String(codes.length) : 'none in this browser'} />
          <div className="row" style={{ marginTop: 16 }}>
            {batch.status !== 'RECALLED' ? (
              <button className="btn danger small" disabled={!!busy} onClick={() => recall(batch.id)}>
                Recall this batch
              </button>
            ) : (
              <span className="hint">Recall is terminal — a recalled batch cannot be reinstated.</span>
            )}
            <Link className="btn small ghost" to={ROUTES.manufacturer}>
              ← All batches
            </Link>
          </div>
        </Card>
      </Section>

      <Section title="Unit sheet" sub="print and attach to the packs">
        <Card>
          <QrSheet batchId={batch.id} codes={codes} />
        </Card>
      </Section>
    </>
  );
}
