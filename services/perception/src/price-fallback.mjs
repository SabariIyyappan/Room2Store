/**
 * Model-estimated pricing, used only when no panel study is available.
 *
 * This is deliberately NOT the product's pricing claim. A Terac study measures
 * willingness to pay on real people; this asks a model to guess a used-market
 * range. Anything produced here is labelled `estimated` so it can never be
 * presented as measured.
 */

import { GEMINI_PRIMARY_MODEL, GEMINI_SAFETY_MODEL } from "./gemini.mjs";

const BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

const PROMPT =
  "You price second-hand goods for a local resale marketplace. Given an item " +
  "and its condition, reply ONLY with strict JSON: " +
  '{"retail_price": number, "asking_price": number, "floor_price": number, "reasoning": string}. ' +
  "retail_price is what the item costs new today. asking_price is a realistic " +
  "local-pickup price for it used in the stated condition — typically 30-60% of " +
  "retail depending on condition and how fast the category loses value. " +
  "floor_price is the least a seller should accept, strictly below asking_price, " +
  "usually 75-85% of it. All whole dollars in USD. Price the actual item named, " +
  "using what you know about that brand and model; do not return a generic number.";

export function isPriceFallbackConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * @returns {Promise<{ok: boolean, price?: number, floorPrice?: number, source: string, reasoning?: string}>}
 */
export async function estimatePrice({ name, condition, category }, { fetchImpl = fetch } = {}) {
  if (!process.env.GEMINI_API_KEY) return { ok: false, source: "estimated", reason: "not_configured" };

  const models = [...new Set([GEMINI_PRIMARY_MODEL, GEMINI_SAFETY_MODEL])];
  for (const model of models) {
    try {
      const response = await fetchImpl(`${BASE_URL}/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT }] },
          contents: [{ role: "user", parts: [{ text: `Item: ${name}\nCondition: ${condition}\nCategory: ${category ?? "unknown"}` }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 256, temperature: 0.2 }
        })
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("");
      const parsed = JSON.parse(String(text).replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim());

      const price = Math.round(Number(parsed.asking_price));
      const floor = Math.round(Number(parsed.floor_price));
      const retail = Math.round(Number(parsed.retail_price));
      if (!Number.isFinite(price) || price <= 0) continue;

      return {
        ok: true,
        price,
        // A floor at or above the asking price would make negotiation impossible.
        floorPrice: Number.isFinite(floor) && floor > 0 && floor < price ? floor : Math.max(1, Math.round(price * 0.8)),
        retailPrice: Number.isFinite(retail) && retail > 0 ? retail : null,
        source: "estimated",
        model,
        reasoning: parsed.reasoning ?? null
      };
    } catch {
      // Try the next model rather than failing the listing.
    }
  }

  return { ok: false, source: "estimated", reason: "all_models_failed" };
}
