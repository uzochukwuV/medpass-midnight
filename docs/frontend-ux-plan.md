# MedPass frontend: routed pages + Alden design system

Plan for turning the single-scroll workspace into a routed, role-separated app
dressed in the Alden editorial language. Written against the code as it stands
(commit `5e693ed`), so every file named here exists today.

---

## 1. Why this change

Today `src/App.tsx` is one page: a hero, four role tabs that swap a screen in
place, then Session / Identity panels. Three problems follow from that shape:

1. **Nothing is addressable.** A manufacturer cannot be sent a link to their
   batch list; a pharmacy cannot bookmark the scan page. Every role shares one
   URL.
2. **The roles are peers, but the flow is not.** The real order is regulator →
   manufacturer → importer → pharmacy. Tabs imply you can start anywhere, so the
   dependency between steps is invisible.
3. **The page is doing two jobs at once** — it is both a product landing page
   (hero, lede, "what is this") and an operating console. Those want different
   layouts and different amounts of chrome.

The fix is to separate the landing page from the workspace, give each
participant its own route, and make the flow order explicit. The Alden system
then supplies the visual register: near-white canvas, two accents, editorial
type. It suits a healthcare provenance tool well — quiet, documentary, and
trustworthy rather than dashboard-loud.

---

## 2. Design language: Alden

### 2.1 The rule that governs everything

**Colour is punctuation, not decoration.** The system is 98% achromatic. The
only chromatic pixels in any viewport are:

| Token | Value | Where it may appear |
|---|---|---|
| `--color-sky-highlight` | `#97cde5` | One word inside a heading; soft card iconography; the bottom-right edge wash |
| `--color-sage-action` | `#c8dfaa` | Primary CTA fill only, plus the decorative section wash |

Everything else is Ink Black, Graphite, Paper White, Parchment Cream, Fog
Border, Silver.

### 2.2 Token mapping onto MedPass

The existing `styles.css` is a dark, multi-accent theme (blue/violet/cyan +
amber/rose/mint). It is replaced wholesale, not layered. The semantic names stay
so component code does not churn.

| MedPass semantic (keep the name) | Alden value | Alden name | Note |
|---|---|---|---|
| `--bg` | `#ffffff` | Paper White | page canvas |
| `--bg-2` | `#f3f1eb` | Parchment Cream | the second surface / product stage |
| `--panel` | `#ffffff` | Paper White | cards are white on either surface |
| `--line` | `#dddcdd` | Fog Border | the only hairline |
| `--line-strong` | `#cbcbcb` | Silver | mid-weight divider |
| `--ink` | `#28262a` | Ink Black | headings, body, heaviest borders |
| `--ink-2` | `#4a4a4c` | Graphite | secondary text, icon strokes |
| `--ink-3` | `#4a4a4c` at 70% | — | captions |
| `--brand` | `#97cde5` | Sky Highlight | **not** a background — in-heading annotation + icon wash |
| `--brand-2` | `#c8dfaa` | Sage Action | primary action |
| `--ok` | `#c8dfaa` | Sage Action | verdict "authentic" |
| `--bad` | `#28262a` on `#f3f1eb` | Ink on Cream | see below |
| `--warn` | Graphite | — | see below |

**The hard part: verdict colours.** A pharmacy scan produces one of nine
outcomes and the current UI leans on green/amber/red. Alden forbids a third and
fourth accent. The resolution is to carry severity with **ink weight and fill
tone, not hue**:

- **AUTHENTIC** — Sage Action pill (`#c8dfaa` fill, Ink text) + Ink Black
  heading. The one place the saturated fill is spent, which is exactly the
  system's rule: the primary outcome earns the only colour.
- **CLONE / RECALLED / REVOKED** — Ink Black fill, Paper White text. A solid
  black pill is *heavier* than any colour and needs no new token. Reserved for
  "stop, do not dispense".
- **EXPIRED / NOT_IMPORTED / NOT_IN_BATCH / NOT_A_PHARMACY / UNKNOWN** —
  Fog Border fill, Ink text, Graphite caption. Informational, not alarming.

This reads as more serious than the current traffic-light scheme and stays
inside two accents.

### 2.3 Type

| Role | Family | Size / leading / tracking |
|---|---|---|
| display | Sans 400 | 56 / 1.00 / −2.24px |
| heading-lg | Serif 400 | 48 / 1.20 / −1.44px |
| heading | Sans 400 | 32 / 1.20 / −0.64px |
| heading-sm | Sans 500 | 24 / 1.30 / −0.48px |
| subheading | Sans 400 | 18 / 1.40 / −0.36px |
| body | Sans 400 | 16 / 1.50 / −0.32px |
| body-sm | Sans 400 | 14 / 1.50 / −0.28px |
| caption | Sans 500 | 12 / 1.20 / +0.24px |

Rules to hold to:

- Serif is **display only** — 40px and up, section openers and pull quotes.
  Never in nav, buttons, badges, or form fields.
- Sans is everything functional, including all data values.
- Negative tracking is the signature; do not let it drift to 0.
- The one serif moment in the app: the landing hero and the section openers on
  each role page. Everything else is sans.

Font loading: Alden's faces are trial fonts and are not distributable, so load
the named substitutes from Google Fonts — **Inter** (400/500/600) and **Source
Serif 4** (400/500) — and keep the Alden family names first in the stack so a
licensed drop-in works unchanged:

```css
--font-sans: 'Stk bureau Sans Book Trial', 'Inter', ui-sans-serif, system-ui, sans-serif;
--font-serif: 'Stk bureau Serif Book Trial', 'Source Serif 4', ui-serif, Georgia, serif;
```

I will note in the README that these are substitutes for the trial faces.

### 2.4 Shape, elevation, spacing

- Radius: cards **16px**, badges **30px**, images/stages **24px**, buttons
  **100px** (fully pill, non-negotiable), small UI **4px**.
- **No box-shadows anywhere.** Elevation is white-card-on-cream-band or
  cream-band-on-white-canvas. The current theme leans on `--shadow`,
  `--shadow-glow`, and gradient backgrounds — all of that goes.
- Spacing scale 8/16/24/32/40/48/64/80/112. Card padding 40px. Section gap 80px.
  Page max-width 1200px.
- The only decorative element is the low-opacity sky-blue edge wash, anchored
  bottom-right of the landing hero and the verdict panel. Never a background
  fill.

---

## 3. Routing architecture

### 3.1 Router choice

Add `react-router-dom` v7 and use `HashRouter`.

- Hash routing means no server rewrite rules, so `vite dev`, `vite preview`, and
  a plain static host all work with zero config. The repo already deploys a
  static `dist`, and I would rather not add a hosting requirement for a demo.
- `react-router` over hand-rolling: nested layouts, `NavLink` active states, and
  `useParams` for `/app/batches/:batchId` are worth the dependency. Hand-rolling
  a router is ~80 lines that then needs its own tests.

`MedPassProvider` wraps the router, so navigating between pages never unmounts
it and the demo engine, ledger, wallet connection, and activity log all survive
route changes. That is the property that makes the demo work.

### 3.2 URL scheme

```
/                          Landing (marketing, no workspace)
/app                       Redirects to /app/overview
/app/overview              Contract state, network, activity, identity
/app/register              Enrolment: every participant asks to be enrolled
/app/manufacturer          Manufacturer home: status + batches
/app/manufacturer/batches/:batchId   Batch detail, unit sheet, QR export, recall
/app/importer              Importer home: status + pending/imported
/app/pharmacy              Scan a unit (the counter screen)
/app/pharmacy/history      Session scan history
/app/regulator             Enrolment desk: pending queue, registry, revoke
/app/regulator/parties/:partyId      Party detail
```

`/` is deliberately not the workspace. A viewer arriving cold gets the
editorial landing page; the workspace lives under `/app`. The nav CTA "Open the
workspace" carries them across.

### 3.3 Enrolment is two-sided: request, then approve

**Every participant registers, not just the manufacturer.** In the contract,
`register_party(role, party_id)` is regulator-only and covers all three
non-regulator roles (`PartyRole` is `MANUFACTURER | IMPORTER | PHARMACY`; the
regulator is sealed in the constructor, not enrolled). So the correct UX is a
two-sided flow, and my first draft collapsed it into "registration panels" that
implied self-enrolment. Correcting that here.

**Side A — the participant asks.** A single shared page at `/app/register`,
reachable from every role page. It shows:

- the acting identity: `participant_id(appSecret)`, and a note that this is what
  gets enrolled;
- a role selector, defaulted from the current page;
- the enrolment status for that identity, derived by scanning the registry
  (see §3.4);
- **Request enrolment** — a *pending* local record plus a copyable
  "enrolment request" string the participant sends to the regulator out of band
  (there is no on-chain inbox, and inventing one would be a contract change);
- **Restore access** when the identity is revoked — this calls `register_party`
  again, which the contract explicitly supports (re-enrolling a revoked party
  removes it from the `revoked` set).

**Side B — the regulator approves.** The regulator page becomes an enrolment
desk:

- **Pending requests** queue: for each, the requested role, the party id, and an
  **Enrol** action that calls `register_party`.
- **Registry** table grouped by role, with revoke / restore.
- A hint that a participant must be enrolled *before* it can act, so the
  dependency is visible on the regulator's side too.

Why a local pending queue rather than an on-chain one: a request has nowhere to
live on-chain — `register_party` is the only enrolment entry point and it is
regulator-only. Adding a request registry would change the contract and its
tests, which is out of scope for a presentation-layer pass. So the request is
local state (persisted like the identity is), and the copyable string is the
real handoff. I will label it plainly as a demo affordance rather than imply the
chain mediates it.

### 3.4 "Am I enrolled?" without reading the registry

The registries are `MerkleTree<32, Bytes<32>>`. A Merkle tree proves membership;
it does not enumerate. Two consequences:

- **In demo mode**, `DemoEngine.ledgerView()` lists parties from the known
  `PERSONAS` set and checks each leaf against the `revoked` set. That is a demo
  convenience — it works only because the cast is known.
- **In live mode**, `live.ts` returns empty `manufacturers` / `importers` /
  `pharmacies` arrays, with a comment saying membership is proved, never listed.
  That is honest but leaves the UI unable to answer "am I enrolled?".

The plan fixes the live gap **without touching the contract**, by adding a
read-only check to `lib/live.ts`:

```
async isEnrolled(role: Exclude<Role, 'regulator'>): Promise<boolean>
```

It derives the caller's own leaf via `partyLeaf(participantId(appSecret))`, asks
the indexer for a membership path for that leaf, and returns whether one exists
(and whether the leaf is in `revoked`). This is self-enrolment status only — it
cannot enumerate anyone else. That is exactly the right shape: a participant may
learn *their own* status, and no one learns the registry contents.

Party tables in the UI therefore show:

| Mode | Party table shows |
|---|---|
| Demo | The full known cast with active/revoked status |
| Live | Only the connected identity's own status, plus a "registry is not enumerable by design" note |

This is a behaviour difference between the two modes, so the UI must state it
rather than look broken in live mode.

### 3.5 Flow order made explicit

The nav lists roles in dependency order — Regulator, Manufacturer, Importer,
Pharmacy — with a thin step indicator. When a prerequisite is missing, the page
says so and links to it rather than silently failing. Concretely:

- Manufacturer batch creation requires the manufacturer to be enrolled →
  if not enrolled, the page shows a "Not enrolled" panel with a link to
  `/app/register` (and from there the regulator's desk).
- Importer shows "no batches awaiting import" when the manufacturer has not
  created any.
- Pharmacy scan against a non-imported batch returns NOT_IMPORTED and the
  verdict panel links to the importer page.

This is the single biggest UX gain: the dependency chain becomes visible.

---

## 4. File layout

```
src/
  main.tsx                      # HashRouter + MedPassProvider
  App.tsx                       # routes only — drops to ~60 lines
  layout/
    AppShell.tsx                # nav, status strip, stage meter, outlet
    NavBar.tsx                  # pill nav, logo, wallet/status right
    PageHeader.tsx              # serif opener + sky-highlighted word
    RequireRole.tsx             # enrolment gate wrapper
  pages/
    Landing.tsx                 # hero, cream product stage, how-it-works
    Overview.tsx                # from App's Session + Identity sections
    Register.tsx                # enrolment request (shared by all roles)
    manufacturer/ManufacturerHome.tsx
    manufacturer/BatchDetail.tsx
    importer/ImporterHome.tsx
    pharmacy/PharmacyScan.tsx
    pharmacy/ScanHistory.tsx
    regulator/RegulatorHome.tsx
    regulator/PartyDetail.tsx
  components/
    ui.tsx                      # retoned: Card, Pill, KV, Stat, Copy, Banner
    StageMeter.tsx              # extracted, retoned
    VerdictCard.tsx             # from ScanVerdict.tsx, retoned
    BatchTable.tsx              # new, shared by manufacturer + overview
    PartyTable.tsx              # new, shared by regulator + overview
    EmptyState.tsx              # new
    QrScanner.tsx               # kept as-is (logic), retoned chrome
  lib/
    routes.ts                   # path constants + builders, one source of truth
    styles/ tokens.css, base.css, components.css
```

`App.tsx` shrinking to a route table is the clearest signal the refactor worked.

---

## 5. Page specifications

### 5.1 `/` — Landing

Full-bleed white canvas. Centered stack, max 1200px.

- **Hero.** 56px sans, −2.24px tracking, Ink Black, one phrase in Sky
  Highlight. Proposed: "Scan a medicine. Get a **proof**, not a promise." with
  *proof* in `#97cde5`. Subline 18px Graphite, 24px below.
- **CTA row** 24px below the subline: Pill Primary (Sage fill, "Open the
  workspace") + a ghost link ("Read the contract").
- **Cream product stage.** Full-bleed `#f3f1eb` band, 80px vertical padding.
  Inside, a 24px-radius frame holding two white cards at 16px radius, 40px
  padding: a mini scan-verdict card and a mini batch card. These are real
  components rendered with static props — not screenshots — so they never go
  stale.
- **How it works.** Three centered editorial blocks (Regulator / Manufacturer &
  Importer / Pharmacy) with serif 40px openers and one highlighted word each.
- **Privacy section.** The "what leaves this screen" content from
  `ManufacturerScreen`, promoted to a full section: three columns, no card
  frames, 16px gap. On-chain vs private vs at-the-counter.
- **Footer.** Ghost links, logo left, monochrome.

### 5.2 `/app/overview`

The operating console, minimal chrome.

- **Status strip** (see §6) at the top.
- **Contract card** — address, mode, batch count, party count, dispensed count,
  copy + refresh, and (live mode only) join/deploy. Lifted from the current
  Session section, restyled as white-on-white cards.
- **Activity feed** — full width, explorer links kept.
- **Identity card** — participant id, secret-key note, copy, regenerate.
- **Network** — selector in live mode, static pill in demo.

### 5.3 `/app/manufacturer` — registration and everything about the manufacturer

This is the page the brief calls out, so it carries real weight.

- **Registration panel.** The manufacturer's participant id, enrolment status
  (Active / Revoked / Not enrolled), and the route to fix it: a link to
  `/app/register` when not enrolled, and **Restore access** when revoked
  (re-enrolment, which the contract supports). Enrolment is the regulator's
  action, so this page states status and offers the request path rather than
  pretending to enrol directly.
- **Create a batch.** Batch id, expiry days, unit codes textarea, metadata
  label. Same fields as today, retoned. The privacy note stays.
- **Your batches.** Table: id, units, expiry, root, status pill, imported pill,
  expired pill, recall action. Rows link to `/app/manufacturer/batches/:id`.
- **Unit sheet export.** Per batch: the codes, copyable, plus a
  **Download QR sheet** action (see §7).
- **What leaves this screen.** Kept — it is the best privacy explainer in the
  app.

### 5.4 `/app/manufacturer/batches/:batchId` — Batch detail

- Header: batch id, status, expiry.
- **On-chain record**: units root, metadata hash, manufacturer commitment,
  import status, terms commitment. This is the "what is actually public" view.
- **Unit sheet**: the codes with per-code copy, and QR export.
- **Recall**: pill CTA with a confirmation step (recall is irreversible).
- **Import link**: if not imported, a link to the importer page.

### 5.5 `/app/importer`

- Registration panel, same shape as the manufacturer's.
- **Awaiting import** — batches with `imported === false`.
- **Imported** — batches with the terms commitment shown as a hash only.
- Terms textarea, retoned.

### 5.5b `/app/register` — enrolment request (shared)

Reachable from every role page and from the nav. One page, three parts:

- **Identity** — the acting `participant_id(appSecret)`, copyable, with the
  note that this is what the regulator enrols.
- **Role** — selector defaulted from where the user came from.
- **Status and action** — Not enrolled → *Request enrolment* (writes the local
  pending record, shows the copyable request string); Revoked → *Restore
  access*; Active → a confirmation, with no action offered.

The page states in one line that approval happens on the regulator's page, so
the request/approve split is never a mystery.

### 5.6 `/app/pharmacy` — the counter screen

The highest-traffic page, so it gets the most restraint.

- Scanning-as selector (demo mode) or connected wallet (live).
- **Scan input** — camera toggle + unit code field, batch select.
- **Two actions**: "Verify only" (ghost) and "Dispense" (Pill Primary Sage).
  The distinction between read-only and consuming is the single most important
  thing to get across, so the copy stays.
- **Verdict card** — see §5.10.
- Everything else moves off this page.

### 5.7 `/app/pharmacy/history`

Session scan list, with the clone alarms visually separated.

### 5.8 `/app/regulator`

- **Pending requests** queue (from `/app/register`), each with an **Enrol**
  action calling `register_party`. Empty state explains that participants
  request enrolment from their own page.
- **Enrolment form** — the direct path: role + party id, for when the regulator
  has the id out of band.
- **Party registry** table grouped by role: label, participant id, status,
  revoke / restore.
- Revoked count stat.
- **Party detail** at `/app/regulator/parties/:partyId`: identity, status,
  history of enrol/revoke actions from the activity log.

### 5.9 Enrolment gating

`RequireRole` wraps the manufacturer/importer/pharmacy routes. In demo mode it
checks the persona's leaf against the ledger's `revoked` set; in live mode it
uses the `isEnrolled` self-check from §3.4 (which also reports revoked). A party
that is not enrolled or is revoked renders an `EmptyState` with the reason and a
link to `/app/register` — where "Restore access" is the action for a revoked
party. This replaces today's silent "transaction failed" path with an
explanation before the user acts.

### 5.10 Verdict card (shared)

The one place the design language gets loud, because it is the product.

- Outcome word at heading (32px sans) or heading-lg, Ink Black.
- One-line plain-English explanation, 18px Graphite.
- **Evidence checklist**, each row a ✓ or ✕ with Graphite caption:
  manufactured by the stated company / imported via an authorized channel / not
  recalled / not previously dispensed.
- Severity styling per §2.2.
- Expandable "Technical detail": nullifier, roots, the circuit's public inputs.
- A low-opacity sky-blue wash anchored bottom-right of this card only.

---

## 6. Shared shell

### 6.1 `AppShell`

- `NavBar`: logo left (Ink 18px/500 wordmark + a small mono-stroke cross),
  pill nav links right at 14px/400 with 32px gaps, and on the far right a
  **status pill** plus the wallet chip. No sticky behaviour, no shadow, no
  bottom border — Alden's nav is borderless.
- Active route: same Ink colour at weight 500, no underline.
- **Status strip**: one line under the nav showing mode (Demo / Live), network,
  batch count, dispensed count, and the contract address shortened. This
  replaces the hero chips that currently scroll away, so the operator always
  knows what they are pointed at.
- `<Outlet />` for the route.
- `StageMeter` stays fixed at the bottom, retoned: Fog hairlines, Sage for
  done, Ink for active, no glow.

### 6.2 Component retoning

`Card`, `Pill`, `KV`, `Stat`, `Copy`, `Banner`, `Section` keep their props so
page code changes stay small. `Card` loses `pad-lg`'s gradient and gains flat
40px padding. `Pill` tone names (`ok`/`warn`/`bad`/`info`/`neutral`) are kept but
remapped per §2.2, so call sites do not change.

---

## 7. New capability: QR sheet export

The brief mentions scanning a unit's QR code, but the app never produces one.
`html5-qrcode` is already a dependency (scanner side only). I will add a
generator so the loop closes:

- Add `qrcode` (small, MIT) as a dependency.
- On the batch detail page, "Download QR sheet" renders one QR per unit code
  into a printable grid, labelled with the code and batch id.
- Encoding: the raw unit code. The scanner already accepts a typed code, so a
  QR is just a faster path to the same string.

This makes the demo end-to-end: create a batch, print the sheet, scan it with
the phone camera, get the verdict. Without it the "scan" story is typed input.

---

## 8. Accessibility

Non-negotiable items, checked as part of the work:

- Ink Black on Paper White is ~15:1. Graphite on white ~8:1. Both pass AA and
  AAA for body text.
- **Sage Action (`#c8dfaa`) with Ink Black text is ~11:1** — the pill CTA
  passes. Sage as a *background wash* is decorative only and never carries text.
- **Sky Highlight (`#97cde5`) as heading text on white is ~1.9:1 and fails.**
  This is the one real tension in the Alden system. I will not use it for text
  that must be readable; on the landing hero, where it is purely editorial, the
  heading is duplicated into the accessible name and the highlighted span is
  marked `aria-hidden`, so screen readers get clean text and the visual
  decoration does not fake a contrast pass. Where a highlighted word must be
  readable (verdict cards, section openers inside the app), it stays Ink Black.
- Verdict severity is never colour-only — it always carries a word and a ✓/✕.
- Focus: 2px Ink Black outline at 2px offset, visible on every interactive
  element; pills included.
- Scan input has a real `<label>`; the camera toggle is a `role="switch"` with
  `aria-checked`.
- `prefers-reduced-motion` disables the spinner rotation and the wash fade.

---

## 9. Execution plan

Each phase ends green (`tsc --noEmit`, `vite build`, 22 contract tests) and is a
separate commit.

| Phase | Work | Verification |
|---|---|---|
| **A. Tokens & primitives** | Replace `styles.css` with `tokens.css` + `base.css` + `components.css`. Retone `ui.tsx`, extract `StageMeter.tsx`. No structure change. | Build passes; every existing screen renders on the light theme; contrast spot-check |
| **B. Router & shell** | Add `react-router-dom`. `AppShell`, `NavBar`, `PageHeader`, `lib/routes.ts`. Move landing to `/`, workspace to `/app/overview`. | All routes reachable; deep-link reload works; provider state survives navigation |
| **C. Role pages** | Split `ManufacturerScreen` → home + batch detail; add importer, pharmacy, regulator pages; shared `BatchTable`/`PartyTable`/`EmptyState`. | Each role flow driven end to end in the browser |
| **C2. Enrolment flow** | `Register.tsx` request page, pending queue on the regulator desk, `isEnrolled` added to `lib/live.ts`, enrolment-status panel on each role home, `RequireRole` gating. | Request → approve → act, for manufacturer, importer and pharmacy; revoke → restore |
| **D. Verdict card** | Retone `ScanVerdict` into `VerdictCard` with the evidence checklist and severity mapping. | AUTHENTIC, CLONE, RECALLED, NOT_IMPORTED, NOT_A_BATCH all rendered and checked |
| **E. QR sheet** | Add `qrcode`, batch-detail export, printable grid. | Generated sheet scans back to the same code |
| **F. Polish** | Edge washes, focus states, reduced-motion, empty states, README note on font substitutes. | Keyboard-only pass; `tsc` + build + tests green |

Estimated shape: A and B are the structural spine and carry most of the risk; C
is mostly mechanical once the shell exists; D–F are contained.

### What I will not do

- No new accent colour, no box-shadows, no serif in UI chrome, no 24px button
  radii. Those are the four rules the system states most plainly.
- No change to the contract, the circuits, or `lib/live.ts` **transaction**
  behaviour. This is a presentation-layer change; the wiring from the previous
  commit stays. The one addition to `live.ts` is the read-only `isEnrolled`
  check (§3.4), which calls no circuit and submits nothing.

---

## 10. Decisions I need from you

1. **Router dependency.** I recommend `react-router-dom` + `HashRouter` (§3.1).
   The alternative is a hand-rolled ~80-line hash router with no new dependency.
   My preference is the dependency; say so if you would rather stay
   dependency-free.
2. **Fonts.** Alden's faces are trial-only. I will load Inter + Source Serif 4
   from Google Fonts and keep the Alden names first in the stack. If you have the
   licensed fonts, drop them in and nothing else changes. OK to fetch from
   Google Fonts, or should the app stay fully offline (system-font fallback)?
3. **Verdict severity without a third colour** (§2.2). My proposal — Sage for
   authentic, solid Ink for stop-class outcomes, Fog for informational — keeps
   Alden's two-accent rule but is a real change from the current
   green/amber/red. Confirm, or tell me to keep a semantic red/amber for
   safety-critical states and accept the deviation.
4. **The landing page.** I am proposing `/` becomes a marketing page and the
   workspace moves to `/app`. If the app should open straight into the
   workspace, I will make `/` redirect to `/app/pharmacy` and keep the landing at
   `/about`.
5. **Enrolment request handoff.** There is no on-chain inbox, so a request has to
   be local state plus a copyable string the participant sends to the regulator
   (§3.3). I am not willing to invent an on-chain request registry — it would
   change the contract and its tests. Confirm the local-pending-queue approach,
   or tell me to drop the request half entirely and keep enrolment as a single
   regulator-side form where the regulator types the party id.
6. **Live-mode party list.** Live mode cannot enumerate the registries, so the
   party table shows only the connected identity's own status plus an
   explanation (§3.4). Demo mode shows the full cast. Acceptable, or would you
   rather the live party table be hidden entirely to avoid the modes looking
   different?
