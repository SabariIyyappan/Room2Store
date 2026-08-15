# Feature: Vision-Based Product Identification (Pioneer API)

## Goal
Given a photo/frame of an object, identify:
1. Product name
2. Brand
3. Category
4. Model number / serial number, if visible in the image

If the model number is not visible, return `MODEL_UNKNOWN` and the frontend
must show a manual text input so the user can type the model/number
themselves. The final product+model string is passed downstream to the
pricing/comps lookup step.

---

## API Provider
Pioneer AI (Fastino Labs) — OpenAI-compatible and Anthropic-compatible
endpoints. Sponsor-provided credits for this hackathon; use the cheapest
vision-capable model that reliably reads on-device labels.

- Base URL (Anthropic-compatible): `https://api.pioneer.ai`
- Base URL (OpenAI-compatible): `https://api.pioneer.ai/v1`
- Auth header: `X-API-Key: YOUR_API_KEY` (key format `pio_sk_...`)
- Full docs: https://agent.pioneer.ai/llms-full.txt

## Model Selection
Use **`claude-haiku-4-5`** as the primary model — vision-capable, cheap,
fast. Fallback to `gemini-2.5-flash` if Haiku is rate-limited or unavailable.
Do NOT default to `claude-opus-4-7` or `gpt-5.5` — reserve those only for a
manual "hard case" retry path if the cheap model fails twice on the same
image, to conserve hackathon credits.

```
PRIMARY_MODEL   = "claude-haiku-4-5"
FALLBACK_MODEL  = "gemini-2.5-flash"
HARD_CASE_MODEL = "claude-opus-4-7"   # only used after 2 failed attempts
```

---

## Request Shape (Anthropic-compatible, primary path)

```python
import anthropic
import base64
import json

client = anthropic.Anthropic(
    base_url="https://api.pioneer.ai",
    api_key=PIONEER_API_KEY,
)

SYSTEM_PROMPT = (
    "You are a product identification module for a resale pricing pipeline. "
    "Given a single photo of an object, respond ONLY with strict JSON, no "
    "markdown fences, no preamble, matching this exact schema: "
    '{"product_name": string, "brand": string, "category": string, '
    '"model_number": string, "confidence": number}. '
    "model_number must be the exact text read from a visible label, "
    "sticker, or engraving on the item. If no model number or serial "
    "number is visible anywhere in the image, set model_number to the "
    "literal string \"MODEL_UNKNOWN\". confidence is 0.0-1.0, your certainty "
    "on brand+category identification. Never guess a model number that is "
    "not literally visible as text in the image."
)

def identify_product(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    message = client.messages.create(
        model=PRIMARY_MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64,
                    },
                },
                {
                    "type": "text",
                    "text": "Identify this product per the schema.",
                },
            ],
        }],
    )

    raw_text = message.content[0].text
    return parse_identification_response(raw_text)


def parse_identification_response(raw_text: str) -> dict:
    """Strict JSON parse with fallback fence-stripping."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model did not return valid JSON: {raw_text!r}") from e

    required_keys = {"product_name", "brand", "category", "model_number", "confidence"}
    if not required_keys.issubset(data.keys()):
        raise ValueError(f"Missing required keys in response: {data}")

    return data
```

---

## Retry / Escalation Logic

```python
def identify_product_with_fallback(image_bytes: bytes) -> dict:
    attempts = [
        (PRIMARY_MODEL, "primary"),
        (FALLBACK_MODEL, "fallback"),
    ]

    last_error = None
    for model_id, label in attempts:
        try:
            result = call_model(model_id, image_bytes)
            return result
        except (ValueError, anthropic.APIError) as e:
            last_error = e
            continue

    # Both cheap attempts failed — escalate once to the expensive model.
    try:
        return call_model(HARD_CASE_MODEL, image_bytes)
    except Exception as e:
        raise RuntimeError(
            f"All identification attempts failed. Last error: {last_error}, "
            f"hard-case error: {e}"
        )
```

Note: `call_model()` should wrap `identify_product()` but accept a
`model_id` parameter — refactor `identify_product` above to take
`model_id: str` as an argument instead of hardcoding `PRIMARY_MODEL`.

---

## Frontend Contract

Backend returns this JSON to the client after identification:

```json
{
  "product_name": "iPhone 13",
  "brand": "Apple",
  "category": "electronics",
  "model_number": "MODEL_UNKNOWN",
  "confidence": 0.91
}
```

Frontend logic:
- If `model_number === "MODEL_UNKNOWN"`: render a text input labeled
  "Model / part number (helps us price accurately)" and let the user type
  it in. Store user-entered value as `model_number` in the item record,
  tag the field `source: "user_input"` vs `source: "vision"`.
- If `model_number` is a real string: show it as pre-filled but still
  editable, tag `source: "vision"`.
- `confidence < 0.5`: also show product_name/brand/category as editable
  fields, not just read-only, since the vision call itself is unsure.

---

## Downstream Handoff

Once `product_name`, `brand`, `model_number` are finalized (vision-read or
user-typed), concatenate into a single query string for the comps/pricing
lookup step, e.g.:

```python
comps_query = f"{data['brand']} {data['product_name']} {data['model_number']}".strip()
# drop "MODEL_UNKNOWN" if still present at this point — should never happen
# if frontend enforced the manual-input step correctly, but guard anyway:
comps_query = comps_query.replace("MODEL_UNKNOWN", "").strip()
```

This string feeds into the existing P0 naive-price-guess step
(comps lookup + VLM) described in the pricing module.

---

## Environment Variables Needed

```
PIONEER_API_KEY=pio_sk_xxxxxxxxxxxx
```

## Error Handling Requirements
- Never let a raw model response with markdown fences or preamble text
  break JSON parsing — always run through `parse_identification_response`.
- Never silently invent a model number — if not literally visible as text
  in the image, must return `MODEL_UNKNOWN`.
- Log every identification call (model used, latency, confidence) to the
  existing Postgres event log / Band room for the judge dashboard's
  observability trail.
- Wrap all Pioneer API calls in a timeout (recommend 15s) since this runs
  inside the catalog pipeline stage and must not stall the whole DAG.

## Testing Checklist
- [ ] Image with clear visible model sticker → returns real model_number
- [ ] Image with no visible model number → returns literal `MODEL_UNKNOWN`
- [ ] Malformed/garbage model output → caught by parse function, triggers fallback model
- [ ] Both cheap models fail → escalates to `claude-opus-4-7` once, then raises clean error
- [ ] Frontend correctly shows manual input only when `MODEL_UNKNOWN`
- [ ] Low confidence (<0.5) still shows editable fields, not locked read-only
