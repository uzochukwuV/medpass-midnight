import { useState } from 'react';
import { useMedPass } from '../contexts/useMedPass';
import { Card, Copy, KV, Pill } from '../components/ui';
import { PERSONAS, ROLE_META } from '../lib/personas';
import { shortHex } from '../lib/format';
import type { Party, Role } from '../lib/types';

const ROLE_TONE: Record<Role, 'info' | 'neutral'> = {
  regulator: 'info',
  manufacturer: 'neutral',
  importer: 'neutral',
  pharmacy: 'neutral',
};

export function RegulatorScreen() {
  const { ledger, identity, register, revoke, reRegister, busy, mode } = useMedPass();
  const [partyId, setPartyId] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'regulator'>>('pharmacy');

  const groups: Array<{ role: Role; title: string; rows: Party[] }> = [
    { role: 'manufacturer', title: 'Manufacturers', rows: ledger?.manufacturers ?? [] },
    { role: 'importer', title: 'Importers', rows: ledger?.importers ?? [] },
    { role: 'pharmacy', title: 'Pharmacies', rows: ledger?.pharmacies ?? [] },
  ];

  return (
    <div className="grid auto-300">
      <Card>
        <h3>
          <span className="glyph">§</span> Enrol a party
        </h3>
        <p className="hint">
          The regulator is sealed into the contract at deploy time. Only it can enrol or revoke a
          party. Each entry commits a party id — the secret behind it never leaves its owner.
        </p>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, 'regulator'>)}>
            <option value="manufacturer">Manufacturer</option>
            <option value="importer">Importer</option>
            <option value="pharmacy">Pharmacy</option>
          </select>
        </div>

        <div className="field">
          <label>Party id</label>
          <input
            type="text"
            value={partyId}
            placeholder={identity.participantId}
            onChange={(e) => setPartyId(e.target.value)}
          />
          <span className="help">
            {mode === 'demo'
              ? 'In demo mode, leave blank to enrol a persona, or paste any party id.'
              : 'This must be participant_id(secret) of the party. Your own device id is prefilled.'}
          </span>
        </div>

        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary" disabled={!!busy} onClick={() => register(role, partyId || undefined)}>
            Enrol {ROLE_META[role].label.toLowerCase()}
          </button>
          {partyId ? (
            <button className="btn ghost small" onClick={() => setPartyId('')}>
              Clear
            </button>
          ) : null}
        </div>

        <details className="tech">
          <summary>This device's identity</summary>
          <div style={{ marginTop: 10 }}>
            <KV k="participant id" v={shortHex(identity.participantId, 14, 10)} />
            <KV k="secret key" v="held in this browser only" mono={false} />
            <div className="row" style={{ marginTop: 8 }}>
              <Copy value={identity.participantId} label="Copy party id" />
            </div>
          </div>
        </details>
      </Card>

      <Card>
        <h3>
          <span className="glyph">▦</span> Trust root
        </h3>
        <p className="hint">The contract's constructor seals the regulator. Everything else is proved against these registries.</p>
        <div style={{ marginTop: 14 }} className="grid cols-2">
          <div className="stat">
            <span className="n">{ledger?.partyCount ?? 0}</span>
            <span className="l">parties enrolled</span>
          </div>
          <div className="stat">
            <span className="n">{ledger?.revoked.length ?? 0}</span>
            <span className="l">revoked</span>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <KV k="registries" v="manufacturers · importers · pharmacies" mono={false} />
          <KV k="membership" v="Merkle proof, no id revealed" mono={false} />
          <KV k="revocation" v="leaf stays, becomes inert" mono={false} />
        </div>
      </Card>

      <div className="span-2 grid auto-300">
        {groups.map((g) => (
          <Card key={g.role}>
            <div className="row between">
              <h3>
                <span className="glyph">{ROLE_META[g.role].glyph}</span> {g.title}
              </h3>
              <Pill tone={ROLE_TONE[g.role]}>{g.rows.length}</Pill>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {g.rows.length === 0 ? (
                <div className="empty">None enrolled yet.</div>
              ) : (
                g.rows.map((p) => (
                  <div key={p.id} className="list-row">
                    <div className="grow">
                      <div className="nm">{p.label}</div>
                      <div className="id mono">{shortHex(p.participantId, 12, 8)}</div>
                    </div>
                    {p.revoked ? <Pill tone="bad">revoked</Pill> : <Pill tone="ok">active</Pill>}
                    {p.revoked ? (
                      <button className="btn small" disabled={!!busy} onClick={() => reRegister(p.id)}>
                        Restore
                      </button>
                    ) : (
                      <button className="btn small danger" disabled={!!busy} onClick={() => revoke(p.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>

      {mode === 'demo' ? (
        <Card className="span-2">
          <h3>
            <span className="glyph">ℹ</span> Demo personas
          </h3>
          <p className="hint">Demo mode runs the real compiled circuits in your browser with these fixed personas.</p>
          <div className="grid auto-240" style={{ marginTop: 12 }}>
            {Object.values(PERSONAS).map((p) => (
              <div key={p.id} className="list-row">
                <div className="grow">
                  <div className="nm">{p.label}</div>
                  <div className="id">{p.role}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
