# Room2Store task board

Read [AGENTS.md](AGENTS.md) and update this board plus `status.md` before and after material work.

| ID | Task | Owner | Status | Files / proof | Next action |
| --- | --- | --- | --- | --- | --- |
| T0 | Shared multi-agent coordination | Shared | Done | `AGENTS.md`, `tasks.md`, `status.md` | All agents must follow the protocol before claiming work. |
| T1 | Photo-identification web flow | Shared baseline | Done | `services/perception`; `npm test` passed | Connect a real vision provider when its credentials are available. |
| T2 | Linq inbound webhook automation | Claude | Done | `services/perception/src/{server,linq}.mjs`, `test/webhook.test.mjs`; 28 tests passed | Route was unreachable (webhook block sat after `server.listen`, an illegal top-level `return`); moved into the handler and covered end to end against a stub Linq API. |
| T3 | Public endpoint and Linq subscription | Claude | Done | Live at `https://room2store-perception.onrender.com`; `render.yaml`, `scripts/{subscribe,verify}-webhook.mjs` | Deployed rather than tunnelled: Render is a sponsor track and the URL is permanent. Subscription live, signature verified. |
| T4 | Photo received → real product recognition | Claude | Done | `services/perception/src/{vision,gemini,catalog}.mjs`; 65 passing tests | Google Gemini answering live. Pioneer is tried first and 403s ("subscribe to the Hobby or Pro plan"), so the code falls through to Gemini. Verified end to end over iMessage. |
| T5 | Listing / pricing / compliance continuation | Claude | In progress | `services/compliance/src/verdict.mjs`, `test/verdict.test.mjs`; naive price now reports `needs_comps` | Compliance verdict and deploy gate are in place and returned from the confirm endpoint. Next: comps lookup for `compsQuery`, then the Terac study. |
| T6 | Customer-led upgrade add-on plan | Codex | Done | `upgrade-plan.md`; reviewed `plan.md`, perception README, and Terac guidebook | Use the P0 Sell Brief, Price Evidence, and Buyer Trust Card as the next product layer. |

## File ownership

- Claude currently holds `services/perception/**` and `services/compliance/**` (T2, T4, T5). T2 was handed over from Codex on 2026-08-15 at the operator's instruction because the webhook route did not parse.
- Codex: claim a file here before editing it.

## Shared acceptance path for T2/T3

1. New user texts the Linq number first.
2. Linq sends a signed `message.received` webhook to the public `/webhooks/linq` endpoint.
3. The service verifies the signature, deduplicates the event, and replies to that exact chat.
4. A text gets the formatted Room2Store welcome; an image gets the photo-intake acknowledgement.
5. `STOP` gets no reply.
