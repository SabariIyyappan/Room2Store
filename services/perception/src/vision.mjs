/**
 * Pioneer AI (Fastino Labs) vision identification.
 *
 * Anthropic-compatible endpoint. The model must never invent a model number:
 * when no label, sticker, or engraving is legible it returns MODEL_UNKNOWN and
 * the caller is responsible for asking a human to type it in.
 */

const DEFAULT_BASE_URL = "https://api.pioneer.ai";
const REQUEST_TIMEOUT_MS = 15_000;

export const PRIMARY_MODEL = "claude-haiku-4-5";
export const FALLBACK_MODEL = "gemini-2.5-flash";
export const HARD_CASE_MODEL = "claude-opus-4-7";
export const MODEL_UNKNOWN = "MODEL_UNKNOWN";

const REQUIRED_KEYS = ["product_name", "brand", "category", "model_number", "confidence"];

/** Shared by every provider so they cannot drift apart on the rules that matter. */
export const IDENTIFICATION_SYSTEM_PROMPT =
  "You are a product identification module for a resale pricing pipeline. " +
  "Given a single photo of an object, respond ONLY with strict JSON, no " +
  "markdown fences, no preamble, matching this exact schema: " +
  '{"product_name": string, "brand": string, "category": string, ' +
  '"model_number": string, "confidence": number}. ' +
  "model_number must be the exact text read from a visible label, sticker, or " +
  "engraving on the item. If no model number or serial number is visible " +
  `anywhere in the image, set model_number to the literal string "${MODEL_UNKNOWN}". ` +
  "confidence is 0.0-1.0, your certainty on brand+category identification. " +
  "Never guess a model number that is not literally visible as text in the image. " +
  "product_name must always be filled in with a short plain-English name a " +
  "resale listing would use, including colour or material when they are obvious " +
  '— for example "black mesh office chair" or "white ceramic table lamp". Never ' +
  'return an empty product_name, and never return "unknown" for it. Set brand to ' +
  '"Unknown" when no brand is visible; that is expected and is not a failure.';

export function isVisionConfigured() {
  return Boolean(process.env.PIONEER_API_KEY);
}

function getApiKey() {
  if (!process.env.PIONEER_API_KEY) throw new Error("PIONEER_API_KEY is not configured.");
  return process.env.PIONEER_API_KEY;
}

/** Splits `data:image/jpeg;base64,AAAA` into its media type and payload. */
export function parseImageDataUrl(imageDataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(imageDataUrl ?? "");
  if (!match) throw new Error("Send a base64 image data URL.");
  return { mediaType: match[1], imageBase64: match[2].replace(/\s+/g, "") };
}

/** Strict JSON parse with fallback fence-stripping. */
export function parseIdentificationResponse(rawText) {
  let cleaned = String(rawText ?? "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
  }

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model did not return valid JSON: ${JSON.stringify(rawText)}`);
  }

  const missing = REQUIRED_KEYS.filter((key) => !(key in data));
  if (missing.length > 0) throw new Error(`Missing required keys in response: ${missing.join(", ")}`);

  const modelNumber = String(data.model_number ?? "").trim();
  const confidence = Number(data.confidence);
  return {
    product_name: String(data.product_name).trim(),
    brand: String(data.brand).trim(),
    category: String(data.category).trim().toLowerCase(),
    model_number: modelNumber === "" ? MODEL_UNKNOWN : modelNumber,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0
  };
}

async function callModel(modelId, { imageBase64, mediaType }) {
  const baseUrl = (process.env.PIONEER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 512,
      system: IDENTIFICATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "Identify this product per the schema." }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    // The body carries the actual reason (bad key, unknown model, no entitlement);
    // without it every failure looks identical.
    const detail = (await response.text().catch(() => "")).slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(`Pioneer request failed with status ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  const payload = await response.json();
  const text = payload?.content?.find?.((part) => part.type === "text")?.text ?? payload?.content?.[0]?.text;
  return parseIdentificationResponse(text);
}

/**
 * Primary → fallback → one hard-case escalation. Every attempt is logged with
 * its model, latency, and confidence for the observability trail.
 */
export async function identifyProductWithFallback(imageDataUrl, { log = defaultLog } = {}) {
  const image = parseImageDataUrl(imageDataUrl);
  const attempts = [PRIMARY_MODEL, FALLBACK_MODEL, HARD_CASE_MODEL];
  const errors = [];

  for (const modelId of attempts) {
    const startedAt = Date.now();
    try {
      const result = await callModel(modelId, image);
      log({ event: "vision.identify", model: modelId, latencyMs: Date.now() - startedAt, confidence: result.confidence, ok: true });
      return { ...result, model: modelId };
    } catch (error) {
      log({ event: "vision.identify", model: modelId, latencyMs: Date.now() - startedAt, ok: false, error: error.message });
      errors.push(`${modelId}: ${error.message}`);
    }
  }

  throw new Error(`All identification attempts failed. ${errors.join(" | ")}`);
}

function defaultLog(entry) {
  console.log(JSON.stringify(entry));
}
