# Room2Store task board

Read [AGENTS.md](AGENTS.md) and update this board plus `status.md` before and after material work.

| ID | Task | Owner | Status | Files / proof | Next action |
| --- | --- | --- | --- | --- | --- |
| T0 | Shared multi-agent coordination | Shared | Done | `AGENTS.md`, `tasks.md`, `status.md` | All agents must follow the protocol before claiming work. |
| T1 | Photo-identification web flow | Shared baseline | Done | `services/perception`; `npm test` passed | Connect a real vision provider when its credentials are available. |
| T2 | Linq inbound webhook automation | Claude | Done | `services/perception/src/{server,linq}.mjs`, `test/webhook.test.mjs`; 28 tests passed | Route was unreachable (webhook block sat after `server.listen`, an illegal top-level `return`); moved into the handler and covered end to end against a stub Linq API. |
| T3 | Public endpoint and Linq subscription | Claude | In progress | Deployed on Render at `https://room2store-perception.onrender.com`; `render.yaml`, `scripts/subscribe-webhook.mjs` | Deployed instead of tunnelling, since Render is a sponsor track and the URL is permanent. Remaining: create the `message.received` subscription and set the real `LINQ_WEBHOOK_SECRET`. |
| T4 | Photo received → real product recognition | Claude | Done | `services/perception/src/vision.mjs`, `catalog.mjs`, `public/app.js`; `test/vision.test.mjs`, `test/catalog-vision.test.mjs` | Pioneer vision with the primary/fallback/hard-case chain, `MODEL_UNKNOWN` manual-input path, and Linq media download into the same identifier. Needs a real `PIONEER_API_KEY` for a live call. |
| T5 | Listing / pricing / compliance continuation | Claude | In progress | `services/compliance/src/verdict.mjs`, `test/verdict.test.mjs`; naive price now reports `needs_comps` | Compliance verdict and deploy gate are in place and returned from the confirm endpoint. Next: comps lookup for `compsQuery`, then the Terac study. |

## File ownership

- Claude currently holds `services/perception/**` and `services/compliance/**` (T2, T4, T5). T2 was handed over from Codex on 2026-08-15 at the operator's instruction because the webhook route did not parse.
- Codex: claim a file here before editing it.

## Shared acceptance path for T2/T3

1. New user texts the Linq number first.
2. Linq sends a signed `message.received` webhook to the public `/webhooks/linq` endpoint.
3. The service verifies the signature, deduplicates the event, and replies to that exact chat.
4. A text gets the formatted Room2Store welcome; an image gets the photo-intake acknowledgement.
5. `STOP` gets no reply.
