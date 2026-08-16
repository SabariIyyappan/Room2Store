# Caveats & the path to the end product

**Written:** 2026-08-15, on `feature/engineer-b-continued` off `main` @ `1012406`.
**Method:** every claim below was checked against the code or against a live API call, not against a status file. Where a previous document is now wrong, that is stated explicitly.

---

## 0. The headline

The pieces are real. **They are not connected to each other.**

Three engineers each built a vertical that works and is tested. But they built to
three different interfaces, and no request has ever crossed from one vertical
into another. The product described in `plan.md` is a *single chain* —
video → items → measured price → compliance → store → buyer → money — and today
that chain has no continuous path through it. What exists is three chains that
each stop at the boundary.

The good news: almost nothing here needs new invention. The remaining work is
overwhelmingly *wiring*, and the wiring points already exist and are named.

---

## 1. What is actually true right now

### 1.1 Genuinely working and live

| Capability | Evidence |
| --- | --- |
| Linq inbound webhook, signed + deduped | Live on Render, unsigned → 401 |
| Photo → identification (A3) | Gemini, verified on real photos over iMessage |
| Seller conversation → listing draft | Live end to end |
| **Terac client + demand-curve fit** | `services/perception/src/terac.mjs` — real WTP extraction, expected-revenue maximisation, 75%-probability floor, refuses below n=5 |
| **Stripe Checkout** | `services/perception/src/stripe.mjs` — real Checkout Sessions, fee/payout ledger |
| Gate engine (B4) | 28 orchestrator tests, one per gate |
| Compliance + veto (B6) | 40 tests; a veto genuinely blocks deploy |
| Workflows DAG (B9), decay (B11), storebuilder (B10) | Tested against fixtures/stubs |
| Judge frontend (C9) | Builds clean |

### 1.2 `INTEGRATION_AUDIT.md` is now out of date — in our favour

That audit was written at the merge and is the best document in the repo, but
three of its "not built at all" rows are **no longer true**:

- **Terac** — it says *"No Terac client exists anywhere."* One does now, with a
  real curve fit. This was the single largest gap in that audit; it has closed.
- **Stripe** — it says *"Nothing. No checkout, no payment of any kind."* Real
  Checkout Session creation exists now.
- **Band** — it says `BAND_ENABLED=false` and credentials blank. Both are now set;
  all 8 agents exist and authenticate (verified live today, §2.1).

Anyone planning from that audit alone will mis-prioritise. Plan from this file.

---

## 2. The caveats, in the order they will hurt

### 2.1 Band agents are addressable but nothing answers them ★ **architectural, not a bug**

Verified live today against `app.band.ai` with the real keys:

- All **8 agents authenticate** — `GET /me` returns 200 and the id matches config for
  every one of Flow Coordinator, Room Cataloger, Pricing Researcher, Price Setter,
  Safety Reviewer, Store Publisher, Sales Concierge, Settlement Clerk.
- A room can be created, a second agent added, and a task message posted
  mentioning it (`201`, appears in room context).
- **No agent ever replies.** Participants sit at `"status": "inactive"`.

The reason is structural: every agent is registered as **external/remote**
(`"is_external": true`, "Remote" in the dashboard). Band runs no model for them.
It is a message bus. For an agent to "act", *our* backend must notice a mention
addressed to it and post back using that agent's own key.

**That listener does not exist anywhere in the codebase.** `grep` for
`webhook|is_external|task_id` across `services/orchestrator` returns nothing.
What we have is the *outbound* half — `postProtocolMessage` lets our services
speak **as** an agent. There is no inbound half.

This is not fatal and does not require rewriting the gate engine. The gates read
room history and are indifferent to who wrote it. But it means:

> Today, "the agents are talking to each other" is our own services posting
> messages under eight different identities. Nothing autonomous is happening
> inside Band.

Decide deliberately which of these we are claiming, because a judge may ask, and
the honest version is still impressive — the gates are real either way.

**Also found live (real bug, currently unfixed):** `BandApiClient.createRoom()`
sends body `{}`; the live API requires `{ "chat": {} }` and returns
`422 Missing field: chat` otherwise. **Every live room creation fails on `main`
today.** This was never caught because B3 only ever ran against the in-memory
double. One-line fix in `services/orchestrator/src/band-client.ts:106`.
Related live constraints discovered: `mentions` must contain ≥1 entry, and an
agent may not mention itself (`cannot_mention_self`).

### 2.2 The two halves of the product are not plumbed together ★ **the big one**

`workflows/src/stage-integrations.ts` is B's socket layer. It calls:

- `POST {PERCEPTION_SERVICE_URL}/ingest`
- `POST {PRICING_SERVICE_URL}/study`
- `POST {COMMERCE_SERVICE_URL}/notify`

`services/perception/src/server.mjs` actually exposes:

- `/api/identify`, `/webhooks/linq`, `/webhooks/terac`, `/webhooks/stripe`,
  `/api/listings`, `/health`

**None of the three routes the DAG calls exist.** And none of the three env vars
is set, so today every stage silently takes its fixture fallback. The pipeline
"passes" because it is talking to `@room2store/contracts/fixtures`, not to A's
real Gemini perception or A's real Terac curve.

Concretely: **the real demand curve in `terac.mjs` and the DAG that would consume
a price evidence record have never met.** The DAG's price comes from
`fixturePriceEvidence` or `syntheticEvidence()` — the latter being a hard-coded
`$25` fallback with `sampleSize: 0`.

That is the gap between "we measured the price on humans" and what the pipeline
currently does.

### 2.3 Nothing shares a database

`services/api` runs in-memory unless `DATABASE_URL` is set; it is not set, and no
Postgres is provisioned. `ROOM2STORE_API_BASE_URL` points at `localhost:3000`.
Perception keeps its own state in `store.mjs`.

So perception's listings and the orchestrator/API's campaigns and items are two
disconnected worlds. `plan.md` calls Postgres "source of truth"; there is no
shared truth today. Anything requiring one vertical to read another's data —
the dashboard showing a real curve, the negotiator reading a floor price — is
blocked on this.

### 2.4 Only one service is deployed, from a stale branch

`room2store-perception` is the only thing on Render, and `render.yaml:6` still
pins `branch: feat/photo-identification`. **Everything merged into `main`,
including all of Engineer B's work and C's CORS fix, is invisible to the live
URL.** The API, orchestrator, workflows and store builder run only on laptops.

### 2.5 Smaller but demo-relevant

| Caveat | Impact |
| --- | --- |
| Superserve sandboxes never provisioned (`SUPERSERVE_API_KEY` blank) | The pause/resume ticker in the demo has nothing behind it |
| Pioneer PII falls back to local regex (key 403s) | The Pioneer track entry is the weaker of the two paths |
| Store deploy never executed live | No campaign repo, no deployed storefront exists |
| Render Workflows registered nowhere | B9 runs in-process; B11's cron needs a `cron_job` service |
| `roles.ts` demands 10 identities, `.env` has 8 | `band:verify` crashes outright on the 2 unconfigured specialists |
| Terac study is one manual run | `n=5`, at `MIN_SAMPLE_SIZE`; no study is launched from code |
| C6 negotiator, C4 App card, C0 buyer pool | Not built |

---

## 3. What to do — ordered by what unblocks the most

The ordering principle: **make one item traverse the whole chain before making
anything wide.** `plan.md` §7 already says one item priced properly beats three
priced sloppily. Every step below is chosen to extend the same single path.

### Step 1 — Fix `createRoom()`, then bootstrap one real room
*Half an hour. Unblocks every Band claim.*

Apply the `{ chat: {} }` fix. Trim `loadBandIdentities` to the 8 standing roles
(or add the 2 specialist identities) so `band:verify` runs. Then run
`band:bootstrap` against one campaign and watch a room appear with 8
participants. **Until this runs once, every Band statement we make is untested.**

### Step 2 — Expose the three routes the DAG already calls
*The highest-leverage work in this document.*

Add to perception: `POST /ingest` (campaignId → draft items) and `POST /study`
(item → `PriceEvidence`, wrapping the existing `priceFromStudy`). Add
`POST /notify` wherever commerce lives. Then set `PERCEPTION_SERVICE_URL` and
`PRICING_SERVICE_URL`.

The moment `/study` returns a real `PriceEvidence` built from `fitDemandCurve`,
**the central claim of the product becomes true in the pipeline** rather than in
one service in isolation. Nothing else on this list changes the story as much.

Note the shape mismatch to resolve: `terac.mjs` returns
`{recommendedPrice, floorPrice, pricePoints:[{price, probability, expectedRevenue}]}`
while contracts' `PriceEvidence` wants `purchaseProbability`, `curveFitQuality`,
`expectedRevenueBefore/After`, `listingDefects`. Write one adapter — do **not**
edit the frozen contracts package.

### Step 3 — Provision one Postgres and point everything at it
Set `DATABASE_URL`, run `services/api/scripts/migrate.ts`, deploy the API, and
set `ROOM2STORE_API_BASE_URL` to it. This is what lets the dashboard read a real
curve and the negotiator read a real floor.

### Step 4 — Point Render at `main` and deploy the API
One line in `render.yaml`. Without it the merge is invisible and Step 3's API has
nowhere to live.

### Step 5 — Run one campaign end to end, on purpose, and watch it fail
Ingest → catalog → price → comply → build → market against one real item, with
Band on. Expect breakage at every seam; that is the point, and it is far cheaper
to find now than during the demo.

### Step 6 — Decide the Band autonomy question
Either (a) accept "our services post as agents, the gates are real" and say so
plainly, or (b) build one inbound listener — poll `getContext` for mentions,
dispatch to the owning service, post the reply — and get *one* agent genuinely
autonomous. (a) is honest and costs nothing. (b) is a much stronger Band-track
claim. **Do not attempt (b) for all eight**; one is a demo, eight is a rewrite.

### Step 7 — Only then, breadth
Superserve pause/resume, live store deploy, the negotiator, the App card, a
second Terac study with a real `n`. Each is genuinely valuable and each is
decoration if Steps 1–5 have not landed.

---

## 4. The three things most likely to embarrass us

1. **"Show us the agents talking."** They authenticate; they don't answer. Have
   the framing from §2.1 ready, or land Step 6(b) on one agent.
2. **"Where does the price come from?"** In `terac.mjs` it is genuinely measured.
   In the *pipeline* it is `syntheticEvidence()`'s `$25`. Step 2 closes this, and
   until it does, be precise about which one is being shown.
3. **"Is this deployed?"** One service, from a branch that predates the merge.

---

## 5. What is genuinely strong

Worth saying plainly, because the list above is all problems:

- The gate engine is real, tested one-test-per-gate, and a compliance veto
  actually halts a deploy. That is the Band track's substance and it exists.
- The demand-curve fit is honest work — it refuses to price below n=5 rather
  than fabricating confidence, which is exactly the right instinct.
- The fixture-first architecture is why three people could work in parallel
  without blocking, and it is why Step 2 is *wiring* rather than *building*.
- `INTEGRATION_AUDIT.md` set a standard of measuring rather than asserting.
  This document is an attempt to hold that line.

The distance from here to the product in `plan.md` is mostly plumbing between
parts that already work. That is a far better position than it looks from any
single status file.
