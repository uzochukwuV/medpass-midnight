# MedPass — anti-counterfeit medicine passport (Midnight / Compact)

Every medicine batch gets a cryptographic passport. A pharmacist scans a unit's
QR code and receives a zero-knowledge proof that the batch was **manufactured by
a registered company**, **imported through an authorized channel**, and is **not
recalled** — plus that the unit really belongs to that batch and has not already
been dispensed. None of this reveals the importer's identity, the pharmacy's
identity, supplier contract terms, pricing, or dispensing history.

Built with the [DareU](https://github.com/jiajun-wang-work/contract) repo as a
**pattern library only**: the Merkle-registry, sealed-ledger, nullifier and
network-free test-harness patterns were reused; no token, vault or betting logic
was carried over.

---

## Why Midnight (the privacy requirement, stated plainly)

A public ledger that lists "which importer imported which batch, for what terms"
is a competitive-intelligence leak. MedPass keeps the auditability that
regulators need while hiding the commercial relationships:

| Public on-chain | Private (never on-chain) |
|---|---|
| which batches exist | importer identity per import |
| manufacturer id per batch | pharmacy identity per dispense |
| expiry, unit-tree root, metadata commitment | supplier contract terms and pricing |
| whether a batch was imported (opaque terms commitment only) | which pharmacy dispensed which unit |
| whether a batch is recalled | raw unit codes (only commitments are stored) |
| the set of dispensed-unit nullifiers | |

---

## Architecture and data flow

```
                         regulator (sealed at deploy)
                                    │  register_party(role, id)
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     manufacturers tree       importers tree        pharmacies tree
     (Merkle<32,Bytes<32>>)   (Merkle<32,Bytes<32>>) (Merkle<32,Bytes<32>>)

  manufacturer ──create_batch──▶  batches[batch_id] = {
                                     manufacturer, expiry, units_root,
                                     metadata_hash, status=ACTIVE }
                                         │
  importer ────record_import───▶  imports[batch_id] = { terms_commitment }
     (proves membership privately; identity NOT disclosed)

  pharmacy ─────verify────────▶  scan: manufacturer + imported + not recalled
            └───dispense──────▶  same checks, then burn nullifier (clone alarm)

  regulator or manufacturer ──recall_batch──▶ status = RECALLED  (terminal)
```

### The unit tree and the QR code

A batch's units form an off-chain, fixed-depth Merkle tree (`depth 32`). The
batch record stores **only the root**. A unit's QR code carries:

```
{ batch_id, unit_index, unit_code, merkle_path_to_units_root }
```

The tree's leaves are commitments `H("medpass:unit:", unit_code)`, so raw unit
codes never touch the chain. Crucially, each unit has its **own** code and path —
there is **no shared batch secret**. A shared secret printed in one genuine pack
would let a counterfeiter clone every unit in the batch.

### Clone detection (the nullifier)

`dispense` derives `nullifier = H("medpass:null:", unit_commitment)` **inside the
circuit** and inserts it into the on-chain `dispensed` set. A pharmacy cannot
choose the nullifier, and a second scan of a copied QR reverts — which the
pharmacist UI reports as **CLONE SUSPECTED**. The nullifier is one-way and
unlinkable, so a verifier learns "this unit was already dispensed" without
learning *who* dispensed it or *where*.

---

## Contract reference — `src/medpass.compact`

**Ledger**

| Field | Type | Meaning |
|---|---|---|
| `regulator` | `sealed Bytes<32>` | regulator participant id, set once at deploy |
| `manufacturers` / `importers` / `pharmacies` | `MerkleTree<32, Bytes<32>>` | live party registries |
| `batches` | `Map<Bytes<32>, BatchRecord>` | batch id → record |
| `imports` | `Map<Bytes<32>, ImportPermit>` | presence ⇒ imported via an authorized channel |
| `dispensed` | `Set<Bytes<32>>` | one-time unit nullifiers |
| `batch_count`, `party_count` | `Counter` | counters |

**Circuits**

| Circuit | Caller | What it proves |
|---|---|---|
| `register_party(role, party_id)` | regulator | enrolls a party into a registry |
| `create_batch(...)` | manufacturer | registry membership (private path) + commits unit root |
| `record_import(batch_id, importer_root, terms_commitment)` | importer | authorized importer, without disclosing identity |
| `recall_batch(batch_id)` | regulator or batch manufacturer | flags a batch (terminal) |
| `verify(batch_id, pharmacy_root, unit_path)` | pharmacy | read-only authenticity scan |
| `dispense(batch_id, pharmacy_root, unit_path)` | pharmacy | same checks, then burns the nullifier |

**Pure helpers** (recomputed off-chain by the app): `participant_id`,
`party_leaf`, `unit_commitment`, `unit_nullifier`.

### Design notes that matter

- **Secrets are witnesses, never arguments.** In Compact a circuit *argument* is a
  public input. Passing a secret key as an argument would leak the identity it is
  meant to hide, so every secret (`caller_sk`, the registry paths, `unit_code`) is
  supplied through a **witness**, and only hashes of witnesses are disclosed.
- **Membership is bound to the caller.** Each circuit asserts
  `path.leaf == party_leaf(participant_id(caller_sk()))` before checking the path
  against the registry root. Without that binding, a leaked path could be replayed
  by a non-member.
- **Registry proofs are pinned to the live tree** with `checkRoot`, so a removed
  member's stale proof cannot be replayed against an old root.
- **`units_root` is bound to the batch record**, so a counterfeiter cannot present
  a unit from a different batch they control.

---

## Build, test, run

Requires Node 22+ and the Compact compiler (`compactc`). The compiler is a native
binary from the official [compact releases](https://github.com/midnightntwrk/compact/releases):

```bash
# install compactc 0.31.1 (Linux x86_64)
curl -fsSL https://github.com/midnightntwrk/compact/releases/download/compactc-v0.31.1/compactc_v0.31.1_x86_64-unknown-linux-musl.zip -o /tmp/compactc.zip
unzip -q /tmp/compactc.zip -d /tmp/compactc && sudo install -m755 /tmp/compactc/* /usr/local/bin/
```

```bash
npm install

npm run build        # compile the contract + generate proving keys
npm run typecheck    # tsc --noEmit
npm test             # real-circuit test suite (no node / proof server)
npm run demo         # narrated end-to-end walkthrough in the terminal
npm run web          # three-view demo UI at http://localhost:12000
```

### React demo app (browser)

`frontend/` is a single-page React app that runs the **real contract** in the
browser — the same compiled circuits the tests use, executed through
`@midnight-ntwrk/compact-runtime` with no wallet, node or proof server. Four
role screens (regulator, manufacturer, importer, pharmacy) drive the full
lifecycle; a pharmacy scan returns an *authentic*, *possible counterfeit* or
*recalled* verdict.

```bash
cd frontend
npm install
npm run dev          # dev server at http://localhost:12001
npm run build        # production bundle -> frontend/dist
npm run typecheck
```

The app bundles the **compiled** contract from `src/managed/`, which `compactc`
generates and git does not track. `dev`, `build` and `typecheck` compile it
automatically on first run (a no-op afterwards), so the compiler must be on your
`PATH` — install it per the Requirements section above. If it is missing, the
script stops with an explanatory message rather than a cryptic Rollup error.

The app also has a **Live** mode that connects to an injected Midnight wallet
(`window.midnight`) and deploys/reads the contract through real providers; the
default **Demo** mode needs no network.

The build produces **seven proving circuits**: `register_party`, `revoke_party`,
`create_batch`, `record_import`, `recall_batch`, `verify`, `dispense`.

### Run against a real network (real zk proofs)

`npm test` and `npm run demo` run entirely in-process. To exercise the contract
against a live Midnight node — real proofs from the proof server, real
transactions balanced with DUST and finalized on-chain — point the runner at a
devnet or a public network.

```bash
# 1. create a wallet and fund its unshielded address from the network's faucet
npm run wallet:new -- preview      # or: preprod, undeployed
#    -> prints the addresses + mnemonic, writes .secrets/preview-wallet.json

# 2. deploy + run the full lifecycle (real proofs)
npm run run:local      # local midnight-local-dev (node :9944, indexer :8088)
npm run run:preview    # Midnight preview  (Midnight-hosted, no token)
npm run run:preprod    # Midnight preprod  (Blockfrost-backed, needs a token)
```

The runner deploys the contract, enrolls four parties, then drives
`create_batch → record_import → verify → dispense`, attempts a clone, recalls the
batch, revokes a pharmacy, and reads the ledger back through the indexer — every
step a finalized transaction. A record of the run (contract address, txIds,
block heights, batch id) is written to `deployments/<network>.json`.

#### Network endpoints (as of October 2026)

| Network | Node / indexer | Token | Faucet |
|---|---|---|---|
| `undeployed` | `localhost:9944` / `localhost:8088` | none | local funding menu |
| `preview` | `rpc/indexer.preview.midnight.network` | none | [preview faucet](https://midnight-tmnight-preview.nethermind.dev/) |
| `preprod` | `*.midnight-preprod.blockfrost.io` | **Blockfrost `nightpreprod` project** | [preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/) |

Midnight shut down its own preprod node and indexer on 2026-10-09; preprod is now
served by Blockfrost, so every preprod URL carries a `?project_id=` token. Create
a Midnight Preprod project at [blockfrost.io](https://blockfrost.io) and export it:

```bash
export BLOCKFROST_PROJECT_ID=nightpreprod...   # required for preprod
```

The proof server is always local (`http://localhost:6300`) on every network,
because it handles private witness data.

Configuration is env-overridable: `MIDNIGHT_NETWORK`, `MIDNIGHT_INDEXER_URL`,
`MIDNIGHT_INDEXER_WS_URL`, `MIDNIGHT_NODE_URL`, `MIDNIGHT_NODE_WS_URL`,
`MIDNIGHT_PROOF_SERVER`, `MEDPASS_WALLET_MNEMONIC`, `BLOCKFROST_PROJECT_ID`,
`MIDNIGHT_PRIVATE_STATE_PASSWORD`.

### Docker

```bash
docker build -t medpass .
docker run --rm -p 12000:12000 medpass
```

The image pins `COMPACTC_VERSION`, compiles the contract, runs the typecheck and
the full test suite at build time, then serves the demo.

### Tests

`tests/helpers/simulator.ts` drives the **real compiled circuits** through
`@midnight-ntwrk/compact-runtime` — no node, indexer or proof server — mirroring
DareU's harness. `tests/medpass.test.ts` covers registry gating, the Merkle
membership proof, the happy path, the clone alarm, recall, unauthorized import,
foreign units, unregistered pharmacies, and the privacy/unlinkability
assertions (the test dumps the whole ledger and asserts no importer/pharmacy id
appears in it).

> Leaf-hashing gotcha: a Compact `MerkleTree` hashes each leaf on insert, so the
> off-chain unit tree must be built by inserting the **raw** commitment bytes.
> Pre-hashing the leaves yields a root the circuit rejects.

---

## Honest limits (do not oversell this)

- **ZK cannot prove a physical pill is genuine.** A counterfeiter who copies a
  valid QR and is scanned *first* still passes. Tamper-evident packaging is still
  required; clone detection catches the *second* scan, not the first.
- **Trust roots.** The regulator and the regulator's party enrollment are trusted.
- **Registries are append-only** in this version; `revoke_party` blocks a struck-off
  party from acting (its membership proofs stop verifying) but does not delete the
  leaf from the registry tree, so the tree root is stable across revocation.
- **`expiry` is recorded and checked on-chain via `kernel.blockTimeLessThan`.** The
  clock is the node's block time; on a devnet it tracks real time. Expiry is a
  coarse upper bound on the batch's validity window, not a precise schedule.
- **The simulator is not a network run.** `npm test` covers circuit logic, asserts,
  ledger writes, Merkle proofs and the nullifier. The separate
  `npm run run:local|preview|preprod` runner covers the rest — zswap coins, wallet
  balancing, DUST fees, indexer finality and ciphertext delivery — on a real node.

---

## Repository layout

```
src/medpass.compact            the contract
src/managed/medpass/           generated (gitignored): contract bindings, zkir, keys
tests/helpers/simulator.ts     network-free harness over the real circuits
tests/medpass.test.ts          contract tests
scripts/demo-core.ts           shared lifecycle used by CLI + web
scripts/demo.ts                CLI walkthrough (npm run demo)
scripts/dev-server.ts          tiny static + /api/demo server (npm run web)
scripts/run-lifecycle.ts       real-network deploy + lifecycle (npm run run:local)
scripts/new-wallet.ts          generate/import a wallet (npm run wallet:new)
scripts/shared/network.ts      endpoint config (devnet / preview / preprod + Blockfrost)
scripts/shared/wallet.ts       wallet + midnight-js providers (real proving)
scripts/shared/medpass.ts      compiled-contract wrapper + witness context
web/index.html                 three-view demo UI
Dockerfile                     reproducible build + test + demo
```
