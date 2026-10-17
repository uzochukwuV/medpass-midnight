import { Link } from 'react-router-dom';
import { useMedPass } from '../contexts/useMedPass';
import { Accent, Card, Pill } from '../components/ui';
import { ROUTES } from '../lib/routes';

/**
 * The landing page. Centered stacks on white canvas, one cream product stage,
 * and the only decorative element in the system: a sky-blue edge wash.
 */
export function Landing() {
  const { mode, ledger } = useMedPass();
  return (
    <>
      <section className="hero wash">
        <div className="page">
          <h1>
            <Accent title="Scan a medicine. Get a proof, not a promise." accent="proof" />
          </h1>
          <p className="lede">
            Every batch carries a cryptographic id. A pharmacist scans a unit and receives a
            zero-knowledge verdict — made by the stated company, imported through an authorized
            channel, not recalled — while supplier contracts and pricing stay sealed.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" to={ROUTES.pharmacy}>
              Open the workspace
            </Link>
            <Link className="btn ghost" to={ROUTES.regulator}>
              See the trust root
            </Link>
          </div>
          <div className="chips">
            <span className="chip">
              <span className="dot" />
              {mode === 'demo' ? 'Demo — real circuits, in-browser' : 'Live — wallet + prover'}
            </span>
            <span className="chip">{ledger?.batchCount ?? 0} batches</span>
            <span className="chip">{ledger?.partyCount ?? 0} parties</span>
            <span className="chip">{ledger?.dispensed.length ?? 0} dispensed</span>
          </div>
        </div>
      </section>

      <section className="stage">
        <div className="page">
          <div className="stage-frame">
            <Card pad>
              <div className="row tight" style={{ marginBottom: 12 }}>
                <Pill tone="ok">✓ authentic</Pill>
                <span className="caption muted">at the counter</span>
              </div>
              <h3>Proof, not data</h3>
              <div className="checks" style={{ marginTop: 16 }}>
                <div className="check pass">
                  <span className="tick">✓</span> Manufactured by the stated company
                </div>
                <div className="check pass">
                  <span className="tick">✓</span> Imported via an authorized channel
                </div>
                <div className="check pass">
                  <span className="tick">✓</span> Not recalled
                </div>
                <div className="check pass">
                  <span className="tick">✓</span> Not previously dispensed
                </div>
              </div>
            </Card>
            <Card pad>
              <div className="row tight" style={{ marginBottom: 12 }}>
                <Pill tone="info">sealed</Pill>
                <span className="caption muted">what never leaves</span>
              </div>
              <h3>Contracts and pricing stay private</h3>
              <p className="hint" style={{ marginTop: 12 }}>
                The importer commits to the commercial terms as a hash. The pharmacy proves it is
                registered with a Merkle membership proof. Neither the supplier, the price, nor the
                scanning pharmacy's identity is ever written on-chain.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="editorial">
        <div className="page">
          <h2 className="serif">
            <Accent title="Four parties, one contract." accent="one contract" />
          </h2>
          <p>
            Each role holds its own secret and proves what it is allowed to do. Nobody has to trust
            anyone's database — the proof is checked against a sealed trust root.
          </p>
          <div className="steps">
            <div className="step">
              <div className="n">01</div>
              <h4>Regulator</h4>
              <p>Seals the trust root at deploy and enrols or revokes every other party.</p>
            </div>
            <div className="step">
              <div className="n">02</div>
              <h4>Manufacturer</h4>
              <p>Creates a batch and enrols its units under a single Merkle root.</p>
            </div>
            <div className="step">
              <div className="n">03</div>
              <h4>Importer</h4>
              <p>Records that a batch cleared an authorized channel, committing the terms.</p>
            </div>
            <div className="step">
              <div className="n">04</div>
              <h4>Pharmacy</h4>
              <p>Scans a unit, gets a verdict, and burns a nullifier on dispense.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="page">
          <div className="section-head">
            <h2>What leaves a screen</h2>
            <span className="sub">on-chain vs. private</span>
          </div>
          <div className="grid cols-3">
            <div>
              <Pill tone="info">on-chain</Pill>
              <p className="hint" style={{ marginTop: 12 }}>
                The unit Merkle root, a metadata hash, the batch id, the recall status, the presence
                of an import and its terms commitment, and one nullifier per dispensed unit.
              </p>
            </div>
            <div>
              <Pill tone="ok">stays private</Pill>
              <p className="hint" style={{ marginTop: 12 }}>
                Unit codes, unit counts, supplier identity, pricing, quantities, the route and dates,
                and the identity of the scanning pharmacy.
              </p>
            </div>
            <div>
              <Pill tone="neutral">at the counter</Pill>
              <p className="hint" style={{ marginTop: 12 }}>
                A verdict, not a data dump. Verify is read-only; dispense burns a one-time nullifier
                so a second scan of the same unit raises a clone alarm.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="page footer-inner">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              ✚
            </span>
            <span className="name">MedPass</span>
          </span>
          <span className="spacer" style={{ flex: 1 }} />
          <Link className="small muted" to={ROUTES.overview}>
            Overview
          </Link>
          <Link className="small muted" to={ROUTES.register}>
            Enrolment
          </Link>
          <span className="small muted">Built on Midnight · Compact</span>
        </div>
      </footer>
    </>
  );
}
