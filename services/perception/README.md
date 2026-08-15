# Photo identification slice

Run `npm run dev:perception`, then open `http://localhost:3000` on a phone or computer. The page supports a camera capture or image upload, offers model choices when identification is uncertain, and creates a provisional naive-price handoff after confirmation.

## Vision identification (Pioneer)

Set `PIONEER_API_KEY` (format `pio_sk_...`) and the service reads the actual photo through Pioneer's Anthropic-compatible endpoint:

| Attempt | Model | When |
| --- | --- | --- |
| 1 | `claude-haiku-4-5` | Always |
| 2 | `gemini-2.5-flash` | Primary errored or returned unparsable JSON |
| 3 | `claude-opus-4-7` | Both cheap attempts failed; escalated once, then a clean error |

Every call is logged as JSON with its model, latency, and confidence.

The model returns `{ product_name, brand, category, model_number, confidence }`. A model number is only reported when it is literally legible on the item; otherwise it is the literal string `MODEL_UNKNOWN`, the API response sets `needsModelNumber: true`, and both the web page and the iMessage reply ask the seller to type it in. Confirmation is refused until they do. When `confidence < 0.5` the response sets `fieldsEditable: true` and the product name becomes an editable field.

The finalized `brand + product + model` string is returned as `compsQuery`, which is the input to the comps/pricing step. `MODEL_UNKNOWN` is never allowed into it.

## Alternate provider

Without `PIONEER_API_KEY`, set `VISION_IDENTIFIER_URL` to an HTTPS endpoint that accepts:

```json
{ "imageName": "item.jpg", "imageDataUrl": "data:image/jpeg;base64,..." }
```

and returns:

```json
{ "candidates": [{ "id": "model-id", "name": "Brand Model", "description": "…", "confidence": 0.9, "referencePrice": 100, "attributes": { "brand": "Brand", "model": "Model", "category": "electronics" } }] }
```

Optionally set `VISION_IDENTIFIER_TOKEN`; it is sent as a bearer token.

With neither variable set the service runs in `demo-fallback` mode, which matches on the **image filename only** and must not be treated as image recognition. The service never silently replaces a failed real provider with a fabricated match.

## Linq inbound webhook

`POST /webhooks/linq` verifies the `webhook-id` / `webhook-timestamp` / `webhook-signature` triple against `LINQ_WEBHOOK_SECRET`, rejects replays by `event_id`, and answers in the same chat:

- text → the Room2Store welcome
- photo → **two messages**: an immediate "Got it — looking at your photo now", then the identification in its own message once vision returns
- `STOP` and the other opt-out keywords → no reply at all

The webhook is acknowledged before the vision call starts, so a slow identification cannot make Linq time out and redeliver the event. The result message uses `${event_id}-result` as its idempotency key, since reusing the acknowledgement's key would make Linq drop it as a repeat.

Replies read like a marketplace listing, and a missing brand or model never blocks one:

```
Looks like a used Sony WH-1000XM5.
Model number on it: WH-1000XM5

What condition is it in — new, excellent, good, or fair?
```

```
Looks like a used black mesh office chair.

What condition is it in — new, excellent, good, or fair?

If you can find a model or part number on a label, send it too and I can price it more accurately.
```

The model asks for a plain resale name including colour or material, so an unbranded item still gets something usable rather than "unknown". A model number is offered as an optional accuracy improvement in chat — unlike the web flow, which requires it before confirming. If identification fails entirely the seller is told plainly and asked what the item is; nothing is ever invented.

## Conversation sessions

Linq keeps one chat id per contact forever, so the service tracks its own sessions. A chat that has been quiet for **30 minutes** is treated as a fresh conversation on its next message and gets the welcome again; inside that window it does not, so ordinary back-and-forth is not interrupted by a repeated greeting. The window measures the gap between consecutive messages, not time since first contact.

Items already sent survive the reset. A returning seller whose chat has items is offered one extra line — *"Reply 1 to check on the items you sent before."* — and `1` (or `old`, `items`, `status`) lists them with their provisional prices. A chat with no items is never shown that prompt, and asking anyway gets a plain "you have not sent me any items yet".

An opt-out never starts or refreshes a session.

Session state is in memory, so a redeploy or a free-tier spin-down clears it. Move it behind the database before anything depends on it surviving.

## Compliance gate

`POST /api/items/:id/confirm` returns `{ item, verdict }`. The verdict comes from `services/compliance`, and `canDeploy(verdict)` is the gate the store builder must respect: prohibited categories, excluded objects, a street address in public copy, or an opted-out contact are a `veto`; unverifiable claims are a `revise`.
