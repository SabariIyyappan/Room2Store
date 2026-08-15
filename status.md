# Room2Store live status

This is an append-only shared activity log. Every agent must follow [AGENTS.md](AGENTS.md): add an entry at task start, after every material action, and at completion or blockage.

## Current approach

`Inbound-first Linq iMessage → signed message.received webhook → Room2Store service → reply in the existing chat → photo intake → catalog/pricing pipeline`

The webhook uses Linq's current nested reply payload (`message.parts`) and `event_id` as the idempotency key. Secrets belong only in process environment variables, never in this file.

## Current state

| Area | State | Notes |
| --- | --- | --- |
| Manual Linq messaging | Working | Existing inbound chat was reused for a formatted Room2Store welcome. |
| Webhook source code | Working | Signature verification, event deduplication, opt-out handling, formatted text reply, and photo identification, all exercised against a stub Linq API. |
| Tests | Passing | `npm test`: 28 passing tests across perception and compliance. |
| Public webhook | Not live | No tunnel binary is installed and the Linq variables are unset. |
| Real vision provider | Implemented, not credentialed | Pioneer path is live once `PIONEER_API_KEY` is set; without it the service stays in explicit demo fallback. |
| Compliance gate | Working | `services/compliance` returns a verdict from the confirm endpoint; a veto blocks deploy. |

## Activity log

| Time (PT) | Agent | Status | Detail |
| --- | --- | --- | --- |
| 2026-08-15 | Codex | STARTED | Established shared status/task protocol for Codex and Claude. |
| 2026-08-15 | Codex | DONE | Read Linq quickstart, webhook, event, sending, and phone-number documentation. |
| 2026-08-15 | Codex | DONE | Sent a formatted Room2Store welcome through Linq's managed sender endpoint after inbound-first activation. |
| 2026-08-15 | Codex | DONE | Added signed Linq webhook reply path and focused tests; `npm test` passed with 4 tests. |
| 2026-08-15 | Codex | BLOCKED | Public tunnel/service startup was interrupted before verification; resume T2/T3 from the task board. |
| 2026-08-15 | Codex | DONE | Created the shared coordination protocol, task board, and live status file. |
| 2026-08-15 | Claude | STARTED | Took over T2/T3 and picked up T4/T5 at the operator's instruction. |
| 2026-08-15 | Claude | DONE | Fixed `server.mjs`: the webhook block sat after `server.listen` at module top level, an illegal `return` that stopped the service from parsing at all. |
| 2026-08-15 | Claude | DONE | Added Pioneer vision identification with the primary → fallback → hard-case chain, strict JSON parsing, a 15 s timeout, and per-call logging of model, latency, and confidence. |
| 2026-08-15 | Claude | DONE | Wired `MODEL_UNKNOWN` through to a required manual model-number input on the web page and to an in-chat question on the iMessage path; confirmation is refused without it. |
| 2026-08-15 | Claude | DONE | Inbound Linq photos are downloaded and identified; a provider failure falls back to the plain acknowledgement rather than a fabricated match. |
| 2026-08-15 | Claude | DONE | Added the compliance verdict service and returned it from the confirm endpoint as the deploy gate. |
| 2026-08-15 | Claude | DONE | `npm test`: 28 passing tests, including an end-to-end webhook test against a stub Linq and Pioneer server. |
| 2026-08-15 | Claude | BLOCKED | T3 needs the operator: no tunnel binary is installed, and `LINQ_API_KEY` / `LINQ_WEBHOOK_SECRET` are unset. |
| 2026-08-15 | Claude | DONE | Read the Linq webhook and attachment guides. Signature scheme matched the implementation. Two mismatches fixed: inbound media parts carry no `mime_type`, so photos were being skipped entirely; and attachment CDN URLs need no auth, so the Linq API key was being sent to the CDN and is no longer. |
| 2026-08-15 | Claude | DONE | Service boots locally on port 3000 and answers `/health`. `npm run dev:perception` now loads `.env` through Node's `--env-file-if-exists`. |
| 2026-08-15 | Codex | PROGRESS | Re-read the shared protocol and task board; Claude owns T2, T4, and T5. Codex will not edit those claimed files. |
| 2026-08-15 | Codex | STARTED | T6: customer-led upgrade add-on analysis; reading the plan, perception README, and Terac guidebook. |
| 2026-08-15 | Codex | DONE | T6: created `upgrade-plan.md`, a customer-led add-on centered on seller control, price evidence, and the Linq buyer trust card. |
| 2026-08-15 | Claude | DONE | Committed the work and pushed `feat/photo-identification` to both `SabariIyyappan/Room2Store` and `suriya911/Room2Store`. Render could not see the team repo because its GitHub App is not installed on that account; deploying from the operator's own copy instead. |
| 2026-08-15 | Claude | DONE | Render blueprint deployed. `https://room2store-perception.onrender.com` answers `/health` with 200, serves the seller page, validates `/api/identify`, and rejects an unsigned webhook with 401. |
| 2026-08-15 | Claude | BLOCKED | Waiting on the operator to create the `message.received` subscription in the Linq dashboard and paste the returned `whsec_` secret into Render as `LINQ_WEBHOOK_SECRET`. |
| 2026-08-15 | Claude | DONE | Added 30-minute conversation sessions and the returning-seller item list in `services/perception/src/sessions.mjs`. `npm test`: 41 passing tests. Session state is in memory and clears on redeploy. |
