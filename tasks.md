# Room2Store task board

Read [AGENTS.md](AGENTS.md) and update this board plus `status.md` before and after material work.

| ID | Task | Owner | Status | Files / proof | Next action |
| --- | --- | --- | --- | --- | --- |
| T0 | Shared multi-agent coordination | Shared | Done | `AGENTS.md`, `tasks.md`, `status.md` | All agents must follow the protocol before claiming work. |
| T1 | Photo-identification web flow | Shared baseline | Done | `services/perception`; `npm test` passed | Connect a real vision provider when its credentials are available. |
| T2 | Linq inbound webhook automation | Claude | Done | `services/perception/src/{server,linq}.mjs`, `test/webhook.test.mjs`; 28 tests passed | Route was unreachable (webhook block sat after `server.listen`, an illegal top-level `return`); moved into the handler and covered end to end against a stub Linq API. |
| T3 | Public endpoint and Linq subscription | Claude | Done | Live at `https://room2store-perception.onrender.com`; `render.yaml`, `scripts/{subscribe,verify}-webhook.mjs` | Deployed rather than tunnelled: Render is a sponsor track and the URL is permanent. Subscription live, signature verified. |
| T4 | Photo received → real product recognition | Claude | Done | `services/perception/src/{vision,gemini,catalog}.mjs`; 65 passing tests | Google Gemini answering live. Pioneer is tried first and 403s ("subscribe to the Hobby or Pro plan"), so the code falls through to Gemini. Verified end to end over iMessage. |
| T5 | Seller conversation to listing draft | Claude | Done | `services/perception/src/{sessions,linq}.mjs`, `test/{sessions,listing,reply-format}.test.mjs` | Photo → acknowledgement → identification → condition → listing draft, verified live over iMessage. The price in the draft is a labelled placeholder. |
| T6 | Customer-led upgrade add-on plan | Codex | Done | `upgrade-plan.md`; reviewed `plan.md`, perception README, and Terac guidebook | Use the P0 Sell Brief, Price Evidence, and Buyer Trust Card as the next product layer. |
| T7 | Judge-facing web frontend (React/Vite) | User C | Done | `services/web/**`; `npm run build` clean (2385 modules, 606 KB) | Wire mock data (`src/data/mock.ts`) to real `/api/identify`, Terac results feed, and compliance verdict. Add `services/web` as a static site in `render.yaml`. |
| T8 | CORS middleware on perception server | User C | Done | `services/perception/src/server.mjs`, `test/cors.test.mjs` | Env-driven allowlist via `CORS_ORIGINS`. Defaults to `http://localhost:5173,http://localhost:3000`; wildcard `*` supported. Set the prod web origin once the web deploy exists. |
| T9 | Terac resale marketplace pricing study (n=5) | User C | Done | Terac opportunity `gd6hergw1sdvi8i61gb6cnao`; 5/5 approved | Median WTP $575, trimmed mean $510. For the study item: list $549, accept $450. Reuse the pattern (screener → 5 Qs → WTP + min-seen + missing-info + photo quality) for T11. |
| T10 | Engineer B foundation (B1–B11) | Engineer B | Merged, not deployed | `packages/contracts`, `services/{api,orchestrator,compliance,storebuilder}`, `workflows/`, `apps/store-template`; `eng_b_status.md` | Contracts, Band room, gate engine, specialists, compliance + PII, sandbox manager, Workflows DAG, store builder, price decay. Typechecks pass. **Nothing is deployed and no Postgres is provisioned.** Next: B12 deploy hygiene. |
| T11 | Real price: comps + Terac wiring | **Unclaimed — Engineer A** | Pending | `compsQuery` is emitted; `naivePrice.status` is `needs_comps`; T9 gives a working study pattern | `plan.md` A5–A8. The listing draft's `$25` is hard-coded. This is the project thesis and nothing else replaces it. |
| T12 | Compliance veto on the iMessage path | **Unclaimed — B rules, C call site** | Pending | Two implementations now exist: `services/compliance/src/verdict.mjs` (JS) and B's `rules.ts`/`evaluate.ts` (TS) | Neither runs on the iMessage path, so a prohibited item sent by text still gets a listing draft and the demo's car-seat veto would not fire. **Pick one implementation first** — see File ownership. |
| T13 | Attach the photo to the listing draft | **Unclaimed — Engineer C** | Pending | Draft is text-only in `formatListingDraft` | Outbound media parts. Sandbox rule: the first outbound message in a new chat may not contain links or effects. |
| T14 | Persistence behind the database | **Unclaimed — Engineer B** | Pending | `services/perception/src/sessions.mjs` is an in-memory Map; B's `services/api/src/schema.sql` exists | `plan.md` B2. A redeploy or a free-tier spin-down wipes every session and item list. |

## File ownership

- **Released.** Claude's claim on `services/perception/**` is lifted; anyone may edit it.
- **`services/compliance/` now has two implementations.** Claude wrote `verdict.mjs` (JavaScript, called by `server.mjs`); Engineer B wrote `rules.ts`/`evaluate.ts`/`pii.ts` (TypeScript, called by the gate engine). The directory is B's under `plan.md` §1.3, so B's is canonical — but deleting `verdict.mjs` breaks the perception server's confirm endpoint until it is repointed. Resolve deliberately, not by accident.
- User C holds `services/web/**` (T7) and the CORS block in `services/perception/src/server.mjs` (T8).
- Claim a file here before making overlapping edits.

## Live system

| Thing | Where |
| --- | --- |
| Service | `https://room2store-perception.onrender.com` (Render blueprint, branch `feat/photo-identification`) |
| Webhook | `POST /webhooks/linq`, subscribed to `message.received` only |
| Vision | Google Gemini; Pioneer is tried first and 403s until its account has an inference plan |
| Secrets | Render environment only. `LINQ_API_KEY`, `LINQ_WEBHOOK_SECRET`, `LINQ_PHONE_NUMBER`, `GEMINI_API_KEY`, `PIONEER_API_KEY` |

Diagnostics: `npm run linq:verify -- <url>`, `npm run pioneer:probe`, `npm run gemini:models`.

## Shared acceptance path for T2/T3 — all passing

1. New user texts the Linq number first.
2. Linq sends a signed `message.received` webhook to the public `/webhooks/linq` endpoint.
3. The service verifies the signature, deduplicates the event, and replies to that exact chat.
4. A text gets the formatted Room2Store welcome; a photo gets an acknowledgement, then the identification.
5. `STOP` gets no reply.
