/**
 * Google Gemini vision identification.
 *
 * Same contract as the Pioneer path: it returns
 * { product_name, brand, category, model_number, confidence }, never invents a
 * model number, and always fills product_name with a plain resale name so an
 * unbranded item still gets a usable listing title.
 */

import { IDENTIFICATION_SYSTEM_PROMPT, MODEL_UNKNOWN, parseIdentificationResponse, parseImageDataUrl } from "./vision.mjs";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 15_000;

// Google retires model ids without warning: 2.5-flash and 2.0-flash both 404 as
// of August 2026. Confirm the live ids with `npm run gemini:models`.
export const GEMINI_PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || "gemini-3-flash";
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash";
// A floating alias that cannot be retired out from under us, so a wrong pinned
// id degrades to a working call instead of failing the photo.
export const GEMINI_SAFETY_MODEL = process.env.GEMINI_SAFETY_MODEL || "gemini-flash-lite-latest";

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getApiKey() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");
  return process.env.GEMINI_API_KEY;
}

async function callModel(modelId, { imageBase64, mediaType }) {
  const baseUrl = (process.env.GEMINI_BASE_URL || BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/models/${modelId}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      // Header rather than ?key=, so the key never lands in a URL or an access log.
      "x-goog-api-key": getApiKey()
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: IDENTIFICATION_SYSTEM_PROMPT }] },
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: mediaType, data: imageBase64 } },
          { text: "Identify this product per the schema." }
        ]
      }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 512, temperature: 0 }
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(`Gemini request failed with status ${response.status}${detail ? `: ${detail}` : "."}`);
  }

  const payload = await response.json();
  const blocked = payload?.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini declined the image: ${blocked}`);

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("");
  if (!text) throw new Error("Gemini returned no text content.");
  return parseIdentificationResponse(text);
}

export async function identifyWithGemini(imageDataUrl, { log = defaultLog } = {}) {
  const image = parseImageDataUrl(imageDataUrl);
  const errors = [];

  const attempts = [...new Set([GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_SAFETY_MODEL])];
  for (const modelId of attempts) {
    const startedAt = Date.now();
    try {
      const result = await callModel(modelId, image);
      log({ event: "vision.identify", provider: "gemini", model: modelId, latencyMs: Date.now() - startedAt, confidence: result.confidence, ok: true });
      return { ...result, model: modelId };
    } catch (error) {
      log({ event: "vision.identify", provider: "gemini", model: modelId, latencyMs: Date.now() - startedAt, ok: false, error: error.message });
      errors.push(`${modelId}: ${error.message}`);
    }
  }

  throw new Error(`All Gemini identification attempts failed. ${errors.join(" | ")}`);
}

export { MODEL_UNKNOWN };

function defaultLog(entry) {
  console.log(JSON.stringify(entry));
}
