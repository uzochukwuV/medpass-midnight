# MedPass — Linear backlog

This is a ready-to-file backlog. It was **not** pushed to Linear because
`LINEAR_API_KEY` is not set in this environment. To file it, set the key and run
the `issueCreate` mutation in the [Linear skill](https://linear.app/docs) once per
issue below (team id, title, description, priority).

Priority: 1 = Urgent, 2 = High, 3 = Medium, 4 = Low.

---

## 1. Deploy MedPass to preprod and wire the wallet/indexer path — priority 2

The simulator proves circuit logic but never touches a network. Add a preprod
deployment: proof server, wallet balancing, DUST fees, indexer finality and
ciphertext delivery. Verify a scan end-to-end through a real wallet.

**Acceptance:** a scripted preprod run creates a batch, records an import, and
dispenses a unit, with the nullifier observed on-chain via the indexer.

## 2. Party revocation and registry freshness — priority 2

Registries are append-only. Add `revoke_party` and decide how stale roots are
handled so a removed importer or pharmacy cannot keep proving membership against
an old root. Today `checkRoot` pins proofs to the live tree, but there is no
revocation circuit.

**Acceptance:** a revoked pharmacy's proof is rejected; a test asserts the
revoked id is gone from the live root.

## 3. First-scan clone window — priority 3

ZK cannot prove a physical pill is genuine; a counterfeiter who copies a QR and
is scanned first still passes. Add tamper-evident packaging guidance and, where
possible, a manufacturer-anchored "first activation" step that binds a unit to a
one-time reveal, so the first scan is also provable.

**Acceptance:** a written threat model plus, if feasible, a circuit change with
tests.

## 4. Regulator dashboard — priority 3

Read-only view over the ledger for regulators: list batches, import status,
recall state and recall history. No identity disclosure — reuse the existing
public fields only.

**Acceptance:** a page driven by `/api/ledger` that never reads a witness.

## 5. Gas and ledger-growth budget — priority 4

Measure per-circuit cost on preprod and the growth rate of the `dispensed` set
and the `batches` map. Decide whether nullifiers need pruning or an epoch scheme.

**Acceptance:** a short report with measured figures and a recommendation.

## 6. Packaging/QR format spec — priority 4

Specify the QR payload (`batch_id`, `unit_index`, `unit_code`, Merkle path),
size constraints, and how the app validates it before proving. Document the
rotation rules for unit codes.

**Acceptance:** a versioned spec in `docs/` plus a parser with tests.
