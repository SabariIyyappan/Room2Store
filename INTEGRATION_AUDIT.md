# Integration audit — `main` @ `a1cc3ba`

Written 2026-08-15 after merging every branch into `main`. Measured against [`plan.md`](plan.md), not against anyone's status file. "Works" here means *observed passing or observed live*, not *implemented*.

## What was merged

| Branch | Result |
| --- | --- |
| `feat/photo-identification` (Claude) | Merged. Conflicts in `status.md`/`tasks.md` only — both boards renumbered, no work dropped. |
| `feature/engineer-b-foundation` (Engineer B) | Merged. Conflicts in `.gitignore`, `package.json`, `.env.example` only. |
| `web` (User C) | **Deliberately not merged.** It is `services/web` republished at the repo root for a standalone deploy; its `src` is byte-identical to `services/web/src`. Merging would put `index.html` and a second `package.json` at the root. |

`HANDOFF_USER_C.md` F4 warned B's branch "deletes 73 files from main". **That was a misreading of a two-dot diff.** B branched from the repo's first commit, so those files simply never existed on their branch. The three-dot diff is `109 files changed, 6772 insertions(+)`, zero deletions, and the real merge dropped nothing.

## Verified on the merged tree

| Check | Result |
| --- | --- |
| `npm test` | **69 passing**, 0 failing (perception, compliance-js, pricing, CORS) |
| `pnpm test:workspaces` | **102 passing**, 0 failing (contracts 3, api 1, orchestrator 28, compliance 40, storebuilder 15, workflows 15) |
| `pnpm typecheck` | **Clean across all six packages** — Engineer B's claim confirmed |
| `GET /health` | 200 `{"status":"ok"}` |
| `POST /api/identify` | 200, `source: "gemini-vision"` |
| `POST /webhooks/linq` unsigned | 401 |
| Live iMessage round trip | Photo → acknowledgement → identification → condition → listing draft |

Two things had to be fixed for the merged tree to install at all, both consequences of the merge rather than anyone's mistake:

- **`pnpm-lock.yaml` predated `services/web`**, which sits inside B's `services/*` workspace glob. `pnpm install --frozen-lockfile` failed — and that is exactly what B's `.github/workflows/ci.yml` runs, so CI would have failed on the first push.
- **`pnpm-workspace.yaml` shipped `allowBuilds: esbuild: set this to true or false`**, a literal placeholder that made every `pnpm` command exit 1.

## Against `plan.md` — what is real

### Working, live, and reachable by a judge

| Item | Evidence |
| --- | --- |
| Linq inbound webhook, signed and deduped | Live at `room2store-perception.onrender.com/webhooks/linq`; unsigned rejected 401 |
| Photo → product identification (A3) | Google Gemini, verified on real photos over iMessage |
| Seller conversation to a listing draft | Live end to end |
| 30-minute conversation sessions | 12 tests |
| Compliance rules (B6) | 40 tests in B's package, 6 in Claude's |
| Gate engine (B4) | 28 orchestrator tests, one per gate |
| Workflows DAG (B9) | 15 tests including a gate-blocked deploy batch |
| Price decay (B11) | 9 tests, floor-clamped |
| Store builder (B10) | 15 tests, local and Render deployer paths |
| Judge frontend (C9) | Builds clean, 2385 modules |
| CORS (C) | 4 tests |

### Implemented but never executed against a real system

Everything below typechecks and passes its own tests against fixtures or local stubs. None of it has been run against the live third-party service, so "it works" is unproven.

| Item | Why it is unproven |
| --- | --- |
| **Band room + gates (B3–B5)** | `BAND_ENABLED=false`, every `BAND_*_AGENT_ID`/`API_KEY` blank. A real `BandApiClient` exists and points at `app.band.ai`, but no room has ever been created. **`plan.md` calls Band the permission system; today it is a passing test suite.** |
| **REST API + Postgres (B2)** | `schema.sql` and a Fastify app exist; no database is provisioned and the service is not deployed. Only **1 test**. |
| **Superserve sandboxes (B8)** | `SUPERSERVE_API_KEY` blank; runs the in-memory stub. No pause/resume has happened. |
| **Store deploy (B10)** | No campaign repo created, no static site deployed. |
| **PII scrubbing (B7)** | Calls Pioneer's hosted GLiNER2-PII, which needs the same `PIONEER_API_KEY` that currently 403s, so it falls back to the local regex scrubber. |
| **Render Workflows (B9)** | Runs in process. Nothing registered on Render; B11's cron needs the `cron_job` service B12 would provision. |

### Not built at all

| `plan.md` item | State |
| --- | --- |
| **C1/C5 Stripe payment** | **Nothing.** The only trace is a `stripeReference` column. No checkout, no Agent Pay, no payment of any kind. `plan.md` §0 lists "one real Stripe payment from a real human" as a **non-negotiable** and §4 C4 makes it the eligibility requirement for Best Agent-Run Company. |
| **A7/A8/A10 Terac studies in code** | **No Terac client exists anywhere.** User C ran one study by hand (opportunity `gd6hergw1sdvi8i61gb6cnao`, n=5, median WTP $575) and recorded the numbers in a status file. No demand curve is fitted, and no code consumes a study. |
| **A5 comps lookup** | `compsQuery` is emitted and unused. The listing price is a hard-coded `$25`. |
| **C6 negotiator** | Not built. No floor-price refusal. |
| **C4 iMessage App card** | Not built; replies are plain text. |
| **C0 opt-in buyer pool** | No contacts collected. |
| **A2/A4 video → frames, GLiNER2 attributes** | Not built. Intake is one photo at a time, not a room video. |
| **services/commerce** | Directory does not exist. Linq lives in `services/perception`. |

## The gap that matters most

`plan.md` §0: *"The technical claim: the price is not guessed by an LLM. It is measured on real humans."*

**Today the price is a hard-coded `$25` with no code path to a measured one.** One manual Terac study exists as numbers in a markdown file. The demo script's 2:00 beat — "the demand curve fits live on the dashboard, naive $40 becomes measured $32" — has no implementation behind it. §7 says never cut the Terac loop; it is the single largest missing piece, and no amount of the surrounding infrastructure substitutes for it.

The second gap is Band. §2.2 says *"delete the room and every transition deadlocks"*, and the gate engine is genuinely written to do that — but with `BAND_ENABLED=false` and no agent credentials, no room has ever existed. The gates are real code proven by tests, not a live permission system.

Third is Stripe: a non-negotiable with zero lines written.

## Deployment reality

Only **one** service is deployed: `room2store-perception` on Render. The API, orchestrator, workflows, store builder and web frontend all run locally or in tests only.

**`render.yaml` still pins `branch: feat/photo-identification`.** The live service is therefore running `0ea04dd`, which predates User C's CORS work and this merge. Change that line to `main` (or switch the branch in the Render dashboard) or nothing merged here reaches the live URL.

## Recommended order

1. Point Render at `main` — otherwise this merge is invisible.
2. Stripe checkout. Non-negotiable, currently zero, and verification takes real time.
3. Wire one Terac study into code and fit a curve for one item. One item priced properly beats three priced sloppily (§7).
4. Turn Band on for one campaign with real agent credentials, so one gate visibly fires.
5. Run compliance on the iMessage path, so the car-seat veto in the demo script actually fires.
