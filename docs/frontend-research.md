# MedPass frontend — research and recommended approach

Status: research note. Not yet implemented.
Scope: how to build a browser frontend (React or vanilla) that connects to the
MedPass Compact contract on Midnight, and why.

This document assumes the contract in `src/medpass.compact` and the provider
wiring already proven in `scripts/shared/wallet.ts` + `scripts/shared/medpass.ts`.

---

## 1. Recommendation up front

**Use React + Vite + TypeScript, structured as a small monorepo
(`contract/` + `api/` + `ui/`).** Do not build this in vanilla JS.

Reasons, specific to MedPass:

- The app is **role-based and stateful**. A single page has to switch between
  four actors (regulator, manufacturer, importer, pharmacy) and track wallet
  connection, contract session, per-call proving status, and indexer lag. That is
  a state machine; React (or a similar component model) is the cheap way to
  manage it.
- Midnight's own reference browser DApp (`midnight-leaderboard`) and the
  official starter (`midnightntwrk/midnight-wallet-dapp`) are both **React +
  Vite**. Following them means the provider wiring, wallet bridge and proof
  handling are already solved patterns rather than invented ones.
- The provider layer (`midnight-js-*`) is async and stream-oriented (Apollo for
  indexer subscriptions, RxJS for wallet state). React hooks bind to that
  naturally; vanilla DOM code would be hand-rolling what hooks already do.

Vanilla TS + Vite is viable only if the deliverable is deliberately a
single-file demo. If the goal is a shippable pharmacist tool, React wins.

Keep the **`api/` layer framework-free** (plain TS classes) so the same code
drives the CLI (`scripts/demo.ts`), the tests, and the UI — exactly the split
the leaderboard and bboard examples use.

---

## 2. The Midnight frontend stack (packages)

These mirror what the repo already depends on, plus the browser-specific pieces:

| Concern | Package | Notes |
|---|---|---|
| Wallet connection | `@midnight-ntwrk/dapp-connector-api` (^4.0.1) | Types for the injected wallet API |
| Contract deploy/call | `@midnight-ntwrk/midnight-js-contracts` (^4.1.x) | `deployContract`, `findDeployedContract`, call tx |
| Indexer (chain reads) | `@midnight-ntwrk/midnight-js-indexer-public-data-provider` | GraphQL + WS |
| ZK artifacts (browser) | `@midnight-ntwrk/midnight-js-fetch-zk-config-provider` | `FetchZkConfigProvider` over HTTP |
| ZK artifacts (node) | `@midnight-ntwrk/midnight-js-node-zk-config-provider` | Already used by scripts |
| Proving — local server | `@midnight-ntwrk/midnight-js-http-client-proof-provider` | Talks to the proof server |
| Proving — wallet-delegated | `@midnight-ntwrk/midnight-js-dapp-connector-proof-provider` | **Preferred in browser** (see §6) |
| Private state | `@midnight-ntwrk/midnight-js-level-private-state-provider` | IndexedDB in browser |
| Network id | `@midnight-ntwrk/midnight-js-network-id` | `setNetworkId('preprod')` |
| Ledger types | `@midnight-ntwrk/ledger-v8` | `Transaction`, `CostModel` |

App-shell deps: `react` / `react-dom` (18 or 19), `vite`, `typescript`,
`apollo/client` (indexer subscriptions), `rxjs` (wallet streams), a Buffer
polyfill for the browser, and a QR library (see §8).

---

## 3. Wallet connection — DApp Connector API v4

The wallet extension injects itself at `window.midnight.<walletId>`. In v4 the
wallet id is a **generated UUID**, not the old fixed `mnLace` name, so discovery
must iterate the object:

```ts
type InitialAPI = {
  rdns: string; name: string; icon: string; apiVersion: string;
  connect(networkId: string): Promise<ConnectedAPI>;
};

function findWallets(): InitialAPI[] {
  const injected = (window as any).midnight ?? {};
  return Object.values(injected).filter(
    (w): w is InitialAPI => !!w && typeof (w as any).connect === 'function',
  );
}

async function connect(): Promise<ConnectedAPI> {
  const [wallet] = findWallets();               // or present a picker
  return wallet.connect('preprod');             // v4: network-aware
}
```

What `ConnectedAPI` gives us (v4 replaced the old `state()` blob with granular
calls):

- `getConfiguration()` — service URIs (`indexerUri`, `indexerWsUri`,
  `proverServerUri`, `submissionServerUri`). This is how the dApp learns which
  indexer and proof server the wallet is pointed at, instead of hardcoding them.
- `getUnshieldedAddress()`, `getShieldedAddresses()`, `getDustAddress()` —
  addresses for display / DUST funding checks.
- `balanceUnsealedTransaction(hexTx)` — wallet collects inputs, pays fees, and
  signs. This is the normal path for **contract calls**.
- `balanceSealedTransaction(...)` — for transfers/swaps where the tx is sealed.
- `submitTransaction(hexTx)` — wallet relays the balanced, proven tx.
- `getProvingProvider(zkConfigProvider)` — **wallet-side proving** (delegated).
- `signData(...)` — sign arbitrary data.

**Breaking change to be aware of:** v3 used `enable()` / `isEnabled()` and
`state()`. All of that is gone in v4 (`connect(networkId)` instead). Any older
tutorial using `window.midnight.mnLace.enable()` will not run against current
Lace.

Wallets that implement the connector: **Lace (Midnight edition)** and **1AM**.
Midnight's docs note Lace-Midnight is intended to fold into the main Lace wallet
over time, so keep the wallet bridge behind one module (`lib/walletAdapter.ts`)
and treat the concrete wallet as swappable.

---

## 4. Provider assembly (the core of the frontend)

This is the browser analogue of the repo's `scripts/shared/wallet.ts`. In the
browser the wallet replaces the hand-built wallet facade:

```ts
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';

export async function buildProviders(api: ConnectedAPI, coinPublicKey: string): Promise<MidnightProviders> {
  setNetworkId('preprod');
  const cfg = await api.getConfiguration();

  const zkConfigProvider = new FetchZkConfigProvider(
    `${window.location.origin}/zk/medpass`,   // served from our own origin
    fetch.bind(window),
  );

  const privateStateProvider = levelPrivateStateProvider({
    accountId: coinPublicKey,
    privateStoragePasswordProvider: () => userPassword,   // IndexedDB, AES-256-GCM
  });

  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(cfg.indexerUri, cfg.indexerWsUri),
    zkConfigProvider,
    // Prefer wallet-side proving; fall back to a same-origin proof-server proxy.
    proofProvider: await dappConnectorProofProvider(api, zkConfigProvider, CostModel.initialCostModel()),
    walletProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => encryptionPublicKey,
      async balanceTx(tx) {
        const res = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(res.tx));
      },
    },
    midnightProvider: {
      async submitTx(tx) {
        await api.submitTransaction(toHex(tx.serialize()));
        return (tx as any).identifiers()?.first ?? '';
      },
    },
  };
}
```

Key point: **the wallet bridge (`walletProvider` / `midnightProvider`) is the
only place that talks to the extension.** Everything else is the same
`MidnightProviders` shape the Node scripts already build, so `api/` code is
portable between CLI and browser.

Gotchas:
- `getCoinPublicKey()` is **synchronous** in the SDK interface, but the wallet's
  `getShieldedAddresses()` is **async** — pre-fetch the address at connect time
  and close over the resolved hex string (documented in the ticketing-DApp
  write-up).
- The ZK artifacts (`keys/`, `zkir/`) must be served as static files from the
  app origin and fetched by `FetchZkConfigProvider`. In this repo they are
  produced by `npm run build` into `src/managed/medpass/{keys,zkir}`.

---

## 5. Deploy, call circuits, read the ledger

`midnight-js-contracts` exposes two entry points:

```ts
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

// Regulator deploys once (constructor seals the regulator):
const deployed = await deployContract(providers, {
  compiledContract,          // CompiledContract.make('medpass', Contract).pipe(...)
  privateStateId: 'medpass',
  initialPrivateState: {},
  args: [regulatorCommitment],
});

// Everyone else joins the known address:
const joined = await findDeployedContract(providers, {
  contractAddress,
  compiledContract,
  privateStateId: 'medpass',
  initialPrivateState: {},
});

// Circuit calls (one per `export circuit` in the contract):
await joined.callTx.verify(/* disclosed args */);
await joined.callTx.create_batch(...);
await joined.callTx.record_import(...);
await joined.callTx.dispense(...);
await joined.callTx.recall_batch(...);
await joined.callTx.register_party(...);
await joined.callTx.revoke_party(...);
```

Reading public ledger state (the pharmacy's "verify" view, dashboards):

```ts
import { ledger } from '../contract/index.js';   // generated

const state = await providers.publicDataProvider.queryContractState(contractAddress);
const L = ledger(state!.data);
// L.batch_count, L.party_count, L.manufacturers (MerkleTree), L.batches (Map),
// L.imports, L.dispensed, L.revoked ...
```

**Indexer lag is real**: after a call finalizes the indexer may trail a block.
Poll `queryContractState` until the expected leaf/entry appears before deriving
a Merkle path (already noted in `AGENTS.md`).

---

## 6. Proving from the browser (the important constraint)

There are two ways to prove, and the choice matters:

1. **Wallet-delegated proving (preferred).** `dappConnectorProofProvider` +
   `api.getProvingProvider(...)` — the wallet generates the proof. No local
   Docker, no CORS problem, no version/port matching. This is where Midnight is
   heading, and it is the least-friction path for a browser DApp.

2. **A proof server.** The proof server (`midnightntwrk/proof-server`,
   default port `6300`) **has no CORS headers**. Calling it directly from a
   browser page fails. Two fixes:
   - Proxy it **same-origin** (a tiny backend route, e.g. `/api/prove`, that
     forwards to `http://127.0.0.1:6300/prove`), or
   - run it as a local service and reach it via the app's own origin.

   The repo's `scripts/dev-server.ts` is a natural place to add that proxy for
   local development.

Operational notes from the field:
- The proof server version must be compatible with the contract's ledger era;
  the `midnight-wallet-dapp` template notes a **port split across the ledger
  fork** (`6301` for ledger-v8 contracts, `6300` for ledger-v9) and reads the
  runtime spec version to tell which side the chain is on. Pin the proof-server
  image version to the contract's `ledger-v8` line.
- The proof server **must be running** while the DApp is used. When it is not,
  the SDK surfaces `ClientError: Failed to prove` (sometimes a bare `408` with an
  empty body) and nothing appears in the server log — the request never arrives.
  This exact failure was diagnosed in this repo; see `AGENTS.md`. The UI should
  detect it and show "prover unavailable", not a raw stack trace.

---

## 7. Private state and the privacy requirement

MedPass must **not** expose supplier contracts or pricing. The design already
keeps every secret in **witnesses**, never in circuit arguments (see the header
of `scripts/shared/medpass.ts`):

- `caller_sk`, `manufacturer_path`, `importer_path`, `pharmacy_path`,
  `unit_code` — all witnesses, so they never enter the public proof preimage.

Frontend consequences:
- Witness values live only in the browser and are sent only to the prover
  (wallet or local proof server). They must never be logged, put in URLs, or
  sent to the indexer.
- `levelPrivateStateProvider` persists private state **encrypted (AES-256-GCM)
  in IndexedDB**; the password comes from `privateStoragePasswordProvider`. In
  the browser that password should be derived from an explicit user unlock, not
  hardcoded (the Node scripts use a fixed dev password — that must not carry
  over).
- The UI needs a `setActive(...)` equivalent to the repo's `ActiveContext`: a
  per-call context object that supplies the right Merkle paths and the scanned
  unit code to the witnesses. Keep it in memory only, and clear it after each
  call.
- The "verify" screen should render **only** what the circuit returns
  (manufacturer-authentic / authorized-channel / not-recalled booleans), never
  the underlying supplier or price data — that data never reaches the browser in
  the first place.

---

## 8. MedPass-specific UI design

Four roles → four workspaces behind one wallet connection:

| Role | Primary actions | Screen |
|---|---|---|
| Regulator | `register_party`, `revoke_party` | Registry console |
| Manufacturer | `create_batch` (enroll units) | Batch builder + QR/unit sheet export |
| Importer | `record_import` | Import / permit screen |
| Pharmacy | `verify`, `dispense` | **Scanner-first** screen |

The pharmacy screen is the product's front door and should be scanner-first:

- **QR scanning** in-browser: `html5-qrcode` (simplest), `@zxing/browser`
  (robust, WASM-free), or the native **`BarcodeDetector`** API where available
  (fastest, but not on all browsers — feature-detect and fall back). The scanned
  payload is the **unit code**, fed straight into the `unit_code` witness.
- **Result card**: three verdicts (manufactured by stated company / imported via
  authorized channel / not recalled) plus batch expiry. A recall or a clone
  re-scan (the nullifier) must render as a hard red state.
- **Proving status**: a visible "proving…" state, because proofs take seconds;
  show success only after the tx finalizes, not after submission.

Cross-cutting UX:
- A single wallet-connection banner (address, network, DUST status).
- A tx lifecycle indicator: `building → proving → balancing → submitting →
  finalized`, mapped from the provider calls, with the tx id linked on a
  preprod explorer.
- Error handling for the known failure modes (prover down, indexer lag, wallet
  rejection, insufficient DUST) with actionable messages.

---

## 9. Concrete project shape

```
frontend/
  ui/                      React + Vite app
    src/
      App.tsx              role switch + wallet/contract session
      contexts/WalletProvider.tsx
      hooks/useContract.ts useWallet.ts useProvingStatus.ts useScanner.ts
      lib/providers.ts     buildProviders()  (browser)
      lib/walletAdapter.ts DApp Connector bridge (v4)
      lib/session.ts       deploy / findDeployedContract
      lib/crypto-shim.ts   Buffer/crypto polyfills
      components/          Scanner, VerdictCard, TxStatus, RoleNav
      screens/             Regulator, Manufacturer, Importer, Pharmacy
    public/zk/medpass/     keys/ + zkir/ copied from src/managed at build
    vite.config.ts
  api/                     framework-free TS (shared with CLI + tests)
    src/medpass.ts         wraps the compiled contract + witnesses
    src/types.ts
```

`api/` reuses the compiled contract from `src/managed/medpass/` and the witness
shape from `scripts/shared/medpass.ts`. Vite needs Node polyfills (`Buffer`,
`crypto`) — `vite-plugin-node-polyfills` or a small `polyfills.ts` (the official
wallet-dapp does the latter).

---

## 10. Build order (suggested)

1. Serve `keys/` + `zkir/` as static assets and get `FetchZkConfigProvider`
   loading one circuit.
2. Wallet connect + `getConfiguration()` + address/DUST display.
3. `findDeployedContract` against the **existing preprod deployment**
   (`a8d42dcd…`) and read the ledger (dashboards work read-only before any
   writing).
4. Wire `verify` (read + proof) on a scanner screen — this is the headline flow.
5. Add the write circuits per role, with the tx lifecycle UI.
6. Add wallet-delegated proving, and a same-origin `/api/prove` proxy as
   fallback.

---

## 11. Reference material

- DApp Connector API v4.0.1 reference —
  https://docs.midnight.network/develop/reference/midnight-api/dapp-connector
- DApp Connector API v4.0.0 release notes (the v3→v4 breaking changes) —
  https://docs.midnight.network/relnotes/dapp-connector-api/dapp-connector-api-4-0-0
- Midnight.js providers —
  https://docs.midnight.network/sdks/official/midnight-js
- Proof server guide — https://docs.midnight.network/guides/run-proof-server
- Leaderboard DApp (React + Lace, in-browser proving, monorepo) —
  https://docs.midnight.network/examples/dapps/leaderboard
- `create-mn-app` (scaffolds `hello-world`, `bboard`, `leaderboard`) —
  https://github.com/midnightntwrk/create-mn-app
- `example-bboard` (React UI + CLI template) —
  https://github.com/midnightntwrk/example-bboard
- `midnight-wallet-dapp` (official React 19 + Vite 7 starter) —
  https://github.com/midnightntwrk/midnight-wallet-dapp
- Shielded-token DApp tutorial (contract → React UI, provider code) —
  https://dev.to/0xfdbu/tutorial-building-a-shielded-token-dapp-on-midnight-from-compact-contract-to-react-ui-183g
- Privacy-preserving ticketing DApp write-up (proof-server CORS via same-origin
  API route, wallet-delegated proving) —
  https://eightblock.dev/articles/building-a-privacy-preserving-event-ticketing-dapp-on-midnight-network
