# Engineer B — Status

Branch: `feature/engineer-b-foundation`. Executing plan.md §3 "ENGINEER B — Orchestration, Compliance & Infrastructure", B1 → B12, in order.

**Done: B1–B11.** Next: B12 (environment/deploy hygiene). Everything below is implemented and typechecked; see "What's not done" for the honest gap list (mainly: nothing in this repo is actually deployed yet).

---

## What's done

### B1 — Repo, contracts, fixtures
`packages/contracts`: shared entity types (`Campaign`, `Item`, `PriceEvidence`, `Verdict`, `Contact`, `Order`, ...), the Band message protocol + validators (`isBandMessage`), status vocabularies, and a fixture pack (`fixtureCampaign`, `fixtureItems` — chair/headphones/lamp, `fixtureCarSeat` for the veto demo, `fixturePriceEvidence`, approve/veto verdicts, synthetic Terac panel responses). pnpm workspace (`packages/*`, `services/*`, `apps/*`, `workflows/*`).

### B2 — Database schema + REST API
`services/api`: Fastify REST + Postgres repository + `schema.sql`. Endpoints for campaigns, items, price-evidence, verdicts, orders, events — what A and C both call, and what `workflows/src/api-client.ts` calls from this side.

### B3 — Band room bootstrap
`services/orchestrator`: `room-service.ts` (`BandRoomService` — creates a Band room per campaign, posts/reads structured protocol messages), `roles.ts` (8 standing agent identities: flowCoordinator, roomCataloger, pricingResearcher, priceSetter, safetyReviewer, storePublisher, salesConcierge, settlementClerk), `bootstrap.ts`.

### B4 — Gate engine
`gate-engine.ts`: the transition table judges will see. 5 gated transitions — `startResearch`, `setPrice`, `deployStore`, `closeSale`, `recordPayment` — each reads the room's protocol history, refuses if the prerequisite message is missing, and posts a real `gate blocked` message naming what's missing. One test per gate in `test/gate-engine.test.ts`.

### B5 — Runtime specialist spawning
`specialists.ts` (category inspection: electronics → serial/stolen-goods check, furniture → dimension check), `spawn-specialists.ts` (coordinator), `roles.ts` split into `standingBandRoles` vs `specialistBandRoles` (electronicsSpecialist/furnitureSpecialist, added to the room only when spawned). `gate-engine.ts`'s `startResearch` is reshoot-aware: a furniture item missing dimensions gets a `catalog needs reshoot` that re-blocks research until a fresh `catalog items ready` clears it — a real dependency where one agent's output changes because of another's finding.

### B6 — Compliance agent
New package `services/compliance`. `rules.ts` (prohibited category incl. the car-seat veto, unverifiable claims, excluded object, unsafe pickup address), `contact-rules.ts` (opted-out contact check), `evaluate.ts` → `Verdict`, `review-item.ts` posts the verdict as the real `compliance verdict` Band message `gate-engine.ts`'s `deployStore` reads. Proven end-to-end: a veto genuinely blocks the gate (`test/review-item.test.ts`).

### B7 — Pioneer PII scrubbing (GLiNER2-PII, not GLiGuard)
Also in `services/compliance`: `pii.ts` (deterministic regex PII detector — email/phone/ssn/credit_card/street_address, sync/no-network, doubles as demo fallback), `pii-model-client.ts` (`LocalPiiModelClient` vs `PioneerPiiClient` — real integration, calls Pioneer AI's hosted `fastino/gliner2-privacy-filter-PII-multi` model via `POST {PIONEER_API_URL}/chat/completions`), `scrub-outbound.ts` (scrubs outbound listing copy and buyer message logs), `scrub-cli.ts`. New compliance rule `checkPublicPii` (revise-tier, auto-fixable by scrubbing).

**Correction made mid-build:** plan.md says "GLiGuard/GLiNER2-PII" as one entry; these are two different Fastino/Pioneer models. GLiGuard is a prompt/response safety guardrail with no documented hosted endpoint we could find; GLiNER2-PII is the actual hosted PII detector and what B7 calls. Env vars are `PIONEER_API_URL`/`PIONEER_API_KEY`.

### B8 — Superserve sandbox manager
`sandbox-manager.ts` (`SuperserveSandboxManager` — real `@superserve/sdk`, confirmed against the shipped `.d.ts`; `LocalSandboxManager` — offline/test fallback; `createSandboxManager()` factory keyed off `SUPERSERVE_API_KEY`), `sandbox-lifecycle.ts` (pure mapping: `"store deployed"` → pause, `"sales inquiry / offer"` → resume). `BandRoomService.postProtocolMessage` auto-reacts and logs every pause/resume to the Band feed via `postSandboxEvent` — wired once so nothing downstream has to remember to call it. `bootstrap.ts` provisions the campaign sandbox at C0.

### B9 — Render Workflows DAG
New workspace package `workflows/` (`@room2store/workflows`), real `@renderinc/sdk` (`/workflows` subpath). `src/stages.ts`: the pipeline stages as DI'd pure functions (`ingestStage`, `catalogStage`, `priceStage`, `complyStage`, `buildStage`, `marketStage`, `sellStage`, `settleStage`) driving real `GateEngine` transitions and posting real Band messages. `src/pipeline.ts`'s `runCampaignPipeline` chains the autonomous seller-side half (ingest→catalog→price→comply→build→market, comply-before-price so a to-be-vetoed item never burns a Terac panel); `sell`/`settle` are separately-triggerable since they're buyer-initiated. `src/render-tasks.ts` registers every stage with Render's `task()`. `src/stage-integrations.ts` is the socket layer for A's perception/pricing and C's commerce — `PERCEPTION_SERVICE_URL`/`PRICING_SERVICE_URL`/`COMMERCE_SERVICE_URL`, each falling back to fixtures until the real service exists.

### B10 — Store builder
New package `services/storebuilder` + static template in `apps/store-template/` (deliberately pre-built per plan.md's own risk mitigation — deploy is a content swap, not a Lovable generation call). `render-template.ts` fills `{{TOKEN}}` placeholders. `github-publisher.ts` (real GitHub REST Contents API, one repo per campaign, idempotent). `site-deployer.ts` (real Render API — `POST/GET /v1/services`, `type: "static_site"`). `build-storefront.ts` composes render→publish→deploy. Wired directly into B9's `buildStage` (in-process call, same precedent as compliance).

### B11 — Price-decay scheduled workflow (built for real, not cut)
plan.md's cut list (§7) marks this optional ("describe it on a slide instead"). **User confirmed: build it for real**, including the "notify watchers" step, rather than stub it.

New files:
- `workflows/src/decay.ts` — pure price-decay math, no IO. `decideDecay(item, msSinceLastPriceSet, evidence)`:
  - No decay under the 24h unsold threshold, or if the item is already at its floor price.
  - **Learned elasticity path:** if A's `PriceEvidence.pricePoints` (from the real Terac study) has a studied price below the current price with higher expected revenue, decay to that price — the demand curve's own answer, same `price × probability` logic A already uses to pick the initial price.
  - **Fallback path:** no usable evidence → flat 10% cut.
  - Both paths are hard-clamped at `item.floorPrice` — decay can never undercut the floor that `closeSale`'s gate and C's negotiator both treat as the bottom.
- `workflows/src/stages.ts` — added `decayStage` (one item) and `decayCampaignStage` (all live items in a campaign). Reads "how long has this price been set" from the Band room's own protocol history (`lastPriceSetAt`, same precedent as `startResearch`'s reshoot-timing logic) rather than a DB timestamp. On decay: patches the item's price, **re-posts the existing frozen `"price set"` Band message** (contracts is frozen — no `"price decayed"` variant exists, so this reuses the same message `priceStage` posts, same precedent as B8 piggybacking sandbox events on existing messages), then calls `deps.integrations.notifyBuyers` — **B9's existing socket to C's commerce layer**, the same one `marketStage` already uses, so "notify watchers" needed no new integration point.
- `workflows/src/api-client.ts` — added `getPriceEvidence(itemId)` (GET `/items/:itemId/price-evidence`, which `services/api` already exposed; returns `undefined` on 404).
- `workflows/src/render-tasks.ts` — registered `decayCampaign` as a Render Workflows task.
- `workflows/src/decay-cli.ts` — `pnpm workflow:decay -- <campaign-id> <room-id>` live demo script, same convention as `pipeline-cli.ts`.
- `workflows/test/decay.test.ts` — 9 new tests: threshold behavior, flat-cut vs elasticity-path selection, floor clamping, full `decayStage` round trip (price re-set + Band message + notify), skip-if-not-live, and `decayCampaignStage` over a mixed batch.

**Important scheduling finding, checked against the installed SDK before coding:** Render Workflows' `task()` (`@renderinc/sdk/workflows`) has **no cron/schedule option** — its `RegisterTaskOptions` only takes `retry`/`timeoutSeconds`/`plan`/`name` (confirmed in the shipped `dist/workflows/types.d.ts`). Actual scheduling on Render is a separate primitive: a `cron_job`-type service with its own `schedule` field, part of Render's general service API (confirmed in `dist/generated/schema.d.ts`). So B11's design is: `decayCampaign` is a normal Workflows task; a Render `cron_job` service (provisioned in B12, since B12 is where all deploy config lives) triggers it on a schedule via the same remote-trigger path (`trigger-client.ts`) C's commerce layer already uses for `sell`/`settle`.

All typechecks pass repo-wide as of this commit (`pnpm typecheck` clean across all 6 packages).

---

## What's not done

- **B12 — Environment and deploy hygiene.** Not started. This is where:
  - The `workflows/` package actually gets deployed as a Render Workflows service (`render workflows init` / linking the repo) — B9 only registered the tasks, nothing is live yet.
  - `services/storebuilder`'s GitHub/Render calls go live (they're real code, but no campaign has been deployed through them yet).
  - The B11 Render `cron_job` service gets provisioned and pointed at `decayCampaign`.
  - One environment template, one deploy command, a staging URL — per plan.md's C2 checkpoint target.
- Nothing in `services/orchestrator`, `services/compliance`, `services/storebuilder`, or `workflows/` has been run against **live** sponsor APIs yet (Band, Pioneer, Superserve, GitHub, Render) — everything has been exercised through the `Local*`/in-memory fallbacks in tests. Going live needs real API keys set in `.env` (see below) and a first live run of each `*:demo`/`*-cli` script.
- `.env` needs real values for: `PIONEER_API_KEY` (was a placeholder as of the last check — `PIONEER_API_URL` defaults are fine), `SUPERSERVE_API_KEY`, `GITHUB_TOKEN`/`GITHUB_OWNER`, `RENDER_API_KEY`/`RENDER_OWNER_ID`, `RENDER_WORKFLOW_SERVICE_SLUG` (once the workflows service is actually linked/named on Render). `.env.example` documents every one of these; `.env` is what's opened in the IDE right now — worth a pass to confirm which are still placeholders before B12's live runs.
- A/C's actual services (`services/perception`, `services/pricing`, `services/commerce`) don't exist in this repo yet — B9's `stage-integrations.ts` sockets (`PERCEPTION_SERVICE_URL`/`PRICING_SERVICE_URL`/`COMMERCE_SERVICE_URL`) are ready and fall back to fixtures/no-op, so B's pipeline runs today with no A/C code merged, but the real integration hasn't been exercised.
- No CI is wired up (plan.md's B1 line mentions CI; what exists is local `pnpm typecheck`/`pnpm test` scripts at the repo root, not an actual pipeline).

## What the user needs to do (nothing blocking right now)

Nothing required to keep B moving — B12 can proceed without further input. Before B12's live runs actually go out, the user should:
1. Confirm real values are in `.env` for the keys listed above (esp. `PIONEER_API_KEY`, since B7 silently and correctly falls back to the local regex PII detector without it — it won't error, but it also won't be the real Pioneer integration during a demo).
2. Decide the Render workflow service's name/slug before B12 links the repo, since `RENDER_WORKFLOW_SERVICE_SLUG` and the cron job's target task slug both depend on it.
3. When B12 is done and something is live, this is the natural point to loop in A/C to confirm their `*_SERVICE_URL`s are ready to point at real services instead of fixtures.

## Conventions (for continuity — B12 or anyone picking this up)

- pnpm workspace, TypeScript `NodeNext`, explicit `.ts` import extensions, `verbatimModuleSyntax`, `strict: true`.
- Tests: `node --experimental-strip-types --test test/*.test.ts`, `node:test`/`node:assert/strict` only — no test framework.
- `--experimental-strip-types` doesn't support TS parameter-property constructor syntax — declare fields explicitly, assign in the constructor body.
- Band-touching tests: `InMemoryBandNetwork` + all `bandRoles` identities + `MemoryCampaignStore` stub, then exercise `BandRoomService`/`GateEngine` directly (see `gate-engine.test.ts` or `review-item.test.ts`).
- Domain fixtures come from `@room2store/contracts/fixtures` — reuse rather than invent.
- New workspace packages: `pnpm install` at repo root to link symlinks, add to root `package.json`'s `typecheck`/`test` scripts.
- Directory ownership is strict — B never edits `services/perception`, `services/pricing`, `services/commerce`, `apps/dashboard`, `apps/seller-web`.
- Always run `pnpm typecheck` and `pnpm test` at the repo root before calling a task done.
- **Before wiring up a named sponsor tool, verify the real product via WebSearch/WebFetch (or the installed package's shipped `.d.ts`) first** — don't invent a plausible endpoint. This caught the GLiGuard/GLiNER2-PII mixup in B7 and the Workflows-has-no-cron finding in B11.
