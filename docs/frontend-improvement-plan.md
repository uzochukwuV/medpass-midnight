# MedPass frontend — analysis and improvement plan

Goal: make the demo tell the story (anti-counterfeit passport, ZK privacy,
clone alarm) end-to-end, with a wallet path that is real rather than decorative.

Scope note: nothing here touches the Compact contract or the circuits. The
contract is the deliverable; this work is about exposing it well.

## 1. Where the code stands

```
src/
  App.tsx                    layout + role tabs + wallet bar
  main.tsx                   root render
  contexts/MedPassProvider   one big state hook; demo vs live dispatch
  lib/
    demo.ts                  DemoEngine — real circuits via @medpass/simulator
    live.ts                  LiveSession — wallet + providers + proving
    wallet.ts                DApp Connector discovery/connect
    identity.ts              app keypair (localStorage)
    network.ts               endpoint config
    personas.ts              demo fixtures
    types.ts, format.ts      shared types + formatting
  screens/                   Regulator, Manufacturer, Importer, Pharmacy
  components/                ui, ActivityFeed, QrScanner, ScanVerdict
```

Demo mode is genuinely strong: it runs the compiled circuits in-browser, so
verdicts and clone detection are produced by real contract logic. That is the
part to protect while reworking everything around it.

## 2. Problems, in priority order

### P1 — Live mode cannot work from a browser (blocking)

`lib/live.ts` wires `levelPrivateStateProvider`, which is backed by `classic-level`
(LevelDB). That is a native Node addon. In a browser it cannot load, so the
first live action throws.

Evidence: `live.ts:86-89` passes `levelPrivateStateProvider(...)` into the
Midnight.js providers. There is no browser private-state provider in the bundle.

Consequence: the Live toggle is a dead end. Either the private state moves to a
browser-backed provider (IndexedDB/localStorage) or Live is removed and the
wallet is used only to pay fees and submit.

Also in this area:
- `live.ts:57` computes `ZK_PATH` at module load from `window.location.origin`.
- `live.ts:90` passes `WebSocket` for the indexer; the isomorphic-ws warning
  means the browser build does not export it cleanly.
- `live.ts:98` deserialises the balanced tx with a fixed constructor signature.

### P2 — The wallet is decorative, and it is a demo liability

`connectWallet()` (`wallet.ts:41`) always takes `wallets[0]`. The wallet is used
only for `balanceUnsealedTransaction` and `submitTransaction`. Nothing shows a
balance, an address the user can verify, or a transaction they can open.

Under-demoed: in the four-role walkthrough the wallet never visibly *does*
anything. A demo audience sees a connect button and nothing else.

Unused API surface that would make it real (`dapp-connector-api/dist/api.d.ts`):
`getDustBalance`, `getUnshieldedBalances`, `getTxHistory`, `getDustAddress`,
`hintUsage`. All available, none wired.

`isStillConnected` (`wallet.ts:68`) is written but never called, so a wallet
disconnected in another tab leaves the UI claiming "connected".

### P3 — The transaction lifecycle is invisible

`busy` is a single string; the UI shows one spinner with "proving and submitting…"
(`App.tsx:206-214`). `TxStage` is declared in `types.ts:74` and never used.

A Midnight transaction has visible stages — build, prove, balance, submit,
finalize — and proving dominates the wall-clock time. Showing them is both
better UX and the single most convincing proof that real cryptography is running.

### P4 — Verdicts are asserted, not evidenced

`ScanVerdict.tsx` maps an outcome to four checkmarks. The checks are *hardcoded
per outcome*, not derived from what the circuit actually proved. The "Why it is
private" panel (`PharmacyScreen.tsx:149`) is static text.

The contract already returns exactly what is needed to do better: the batch's
manufacturer id, unit root, expiry, import presence, recall status, and the
dispensed nullifier set. A verdict should be built from that record, with the
raw proof inputs shown on demand.

### P5 — The flow teaches the wrong order

`App.tsx:18` opens on the Pharmacy tab, on a contract that already has seeded
state. A first-time viewer sees a verdict they did not cause.

The four roles are also shown as peer tabs. They are not peers: regulator seals
the root, then manufacturer, then importer, then pharmacy. The UI should express
that dependency, not hide it behind a tab strip.

There is no "run the whole story" affordance, which is what a demo actually
needs: one action that walks enroll → create → import → scan → clone → recall,
pausing where it matters.

### P6 — Live mode shows empty screens

`live.ts:201-213` returns `manufacturers: []`, `importers: []`, `pharmacies: []`,
`batches: []`, `dispensed: []`. Only `batch_count` and `party_count` are real.

So in Live mode the Regulator screen shows "None enrolled yet" and the
Manufacturer screen shows no batches, even after successful transactions. The
demo looks broken at exactly the moment it should look best.

### P7 — Smaller issues

- `format.ts:43` `timeAgo` is defined and never used.
- `format.ts:38` `unitCodeFromBytes`, `format.ts:57` `expiryFromDays` unused.
- `network.ts:49` `EXPLORER_TX` is defined and never used, so no tx id is
  ever clickable even though every action logs one.
- `types.ts:74` `TxStage` unused.
- `package.json` still depends on `vite-plugin-top-level-await`, removed from the
  config earlier and now dead weight.
- `identity.ts` keeps the app secret in `localStorage` with no export/import.
  If a user clears storage they silently become a different party.
- `demo.ts` reseeds on every reload, so a refresh loses everything the viewer did.

## 3. Plan

Sequenced so the biggest demo risk (P1) is resolved before polish. Each phase
ends with a build + typecheck + headless-browser check.

### Phase A — Make Live real, or make it honest
1. Replace `levelPrivateStateProvider` with a browser private-state provider
   (IndexedDB). If the connector cannot support it, remove Live mode and say so
   in the UI instead of leaving a button that throws.
2. Fix the indexer `WebSocket` import and the `ZK_PATH` origin assumption.
3. Wire `isStillConnected` into a poll so the header reflects reality.

### Phase B — Wallet made visible
4. Wallet picker when more than one connector is injected.
5. Show DUST balance, unshielded address, and network, with the faucet link when
   the balance is zero (the `faucet` field already exists in `network.ts`).
6. Transaction receipt: every logged action gets a clickable explorer link via
   `EXPLORER_TX`, plus recent `getTxHistory` entries.

### Phase C — Transaction lifecycle
7. Replace the single `busy` string with the `TxStage` state machine already
   declared: build → prove → balance → submit → finalized, with elapsed time.
8. Show the proof being generated rather than a generic spinner.

### Phase D — Verdict built from evidence
9. Derive the verdict panel from the on-chain batch record: manufacturer,
   unit-root membership, import commitment, recall status, expiry, nullifier.
10. Move the raw proof inputs (unit path, registry path, nullifier) into an
    expandable "what the circuit saw" panel — this is the privacy story, shown
    rather than told.

### Phase E — Flow and demo affordances
11. Lead with the pharmacy scan; keep the role tabs but mark the dependency
    order and the current actor.
12. Add a guided "Run the whole story" walkthrough that drives all four roles in
    sequence, pausing on the clone alarm and the recall.
13. "Reset demo" so a presenter can re-run without reloading; persist demo state
    so a refresh does not lose it.
14. Export/import the app identity so a party can be restored.

### Phase F — Cleanup
15. Remove the dead dependency and the unused helpers, or wire them up.

## 4. Decisions I need from you

1. **Live mode: fix or drop?** Fixing it needs a browser private-state store and
   a real wallet to test against. If no wallet is reachable in this environment I
   can build it correctly but cannot prove it works — I would rather say that
   than ship a button I have not seen work.
2. **Primary demo surface.** Is the demo a live network walkthrough (real txids,
   real proving time) or the in-browser simulation? This decides how much of
   Phase B/C is on the critical path.
3. **Scope for this pass.** My recommendation is Phase A (or its honest
   removal), C, D, E, F — that is what a viewer actually sees. Phase B only if
   there is a wallet to demo against.
