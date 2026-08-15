# Compliance service

Engineer B owns compliance verdicts and PII scrubbing (B6/B7).

**B6 — done.** `src/rules.ts` runs five checks against every catalog item:
prohibited category (weapons, recalled goods, car seats, medication),
unverifiable claims ("brand new", warranty language), accidental listing of
an excluded object, an exact street address in public copy, and (separately,
via `contact-rules.ts`) messaging an opted-out contact. `evaluate.ts` turns
the findings into a `Verdict`; `review-item.ts` posts it into the Band room
as the real `compliance verdict` protocol message — the same message
`gate-engine.ts`'s `deployStore` transition reads. There is no separate
advisory channel: a veto is the gate input.

`test/review-item.test.ts` is the artifact that proves it — it runs a real
veto through a real gate evaluation and asserts the deploy is refused.

Run the reviewer against a live campaign:

```
pnpm --filter @room2store/compliance compliance:review -- <campaign-id> <room-id>
```

**B7 — done.** `src/pii.ts` is the deterministic PII detector (email, phone,
SSN, credit card, street address) — regex-based on purpose, since it has to
run synchronously inside `rules.ts` and works with no network, so it also
doubles as the demo's fixture fallback. `checkUnsafePickupDetail` (B6) now
sources its street-address check from here instead of its own copy of the
pattern, and a new `checkPublicPii` rule flags the other PII types as a
**revise** (not veto — it's auto-fixable by scrubbing, unlike an unsafe
pickup address).

`pii-model-client.ts` is the live/local split: `LocalPiiModelClient` wraps
`pii.ts` directly; `PioneerPiiClient` is the real Pioneer sponsor
integration — it calls Pioneer AI's hosted **GLiNER2-PII** model
(`fastino/gliner2-privacy-filter-PII-multi`) over their OpenAI-compatible
`/v1/chat/completions` endpoint, configured via `PIONEER_API_KEY` (see
`.env.example`; `PIONEER_API_URL` defaults to `https://api.pioneer.ai/v1`),
and falls back to the local detector on any network failure, non-2xx, or
response shape it doesn't recognize, so a bad response never ships
unredacted text. `createPiiModelClient()` picks whichever is configured.

Note on naming: plan.md's task list pairs "GLiGuard/GLiNER2-PII" as one
Pioneer entry, but per Pioneer's docs these are two different Fastino
models — GLiGuard is a prompt/response *safety* guardrail (jailbreak,
toxicity, refusal detection) with no documented hosted endpoint, not a PII
tool. GLiNER2-PII is the one that actually does PII detection, so that's
the one wired up here; GLiGuard isn't called anywhere in this service.

`scrub-outbound.ts` applies that client to the two B7 surfaces: `scrubListing`
redacts an item's outbound title/description/publicCopy, and
`scrubBuyerMessageLog` redacts a buyer message transcript before it's
persisted or shown on the judge dashboard — that surface has no entity in
`@room2store/contracts` yet (frozen package, no message-log shape agreed),
so `BuyerMessageLogEntry` is a local type C's messaging layer (Linq) can
pass its own log rows into without a contracts change, the same pattern
`contact-rules.ts`'s `canMessageContact` uses.

Run the scrubber against a live campaign's listings (fetches items, scrubs,
PATCHes the cleaned copy back):

```
pnpm --filter @room2store/compliance pii:scrub -- <campaign-id>
```
