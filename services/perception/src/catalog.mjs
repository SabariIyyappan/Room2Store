import { createNaivePrice } from "../../pricing/src/naive-price.mjs";
import { MODEL_UNKNOWN, identifyProductWithFallback, isVisionConfigured } from "./vision.mjs";
import { identifyWithGemini, isGeminiConfigured } from "./gemini.mjs";

const CATALOGS = [
  {
    match: /headphone|sony|bose|airpod/i,
    candidates: [
      candidate("sony-wh-1000xm5", "Sony WH-1000XM5", "Wireless noise-cancelling headphones", 0.86, 399, { brand: "Sony", model: "WH-1000XM5", category: "electronics" }),
      candidate("sony-wh-1000xm4", "Sony WH-1000XM4", "Wireless noise-cancelling headphones", 0.1, 349, { brand: "Sony", model: "WH-1000XM4", category: "electronics" }),
      candidate("bose-qc-ultra", "Bose QuietComfort Ultra", "Wireless noise-cancelling headphones", 0.04, 429, { brand: "Bose", model: "QuietComfort Ultra", category: "electronics" })
    ]
  },
  {
    match: /lamp|light/i,
    candidates: [
      candidate("ikea-fado", "IKEA FADO", "White glass table lamp", 0.64, 30, { brand: "IKEA", model: "FADO", category: "home" }),
      candidate("ikea-tarnaby", "IKEA TÄRNABY", "Vintage-style table lamp", 0.24, 28, { brand: "IKEA", model: "TÄRNABY", category: "home" }),
      candidate("generic-table-lamp", "Generic table lamp", "Table lamp; brand not visible", 0.12, 25, { brand: "Unknown", model: "Unknown", category: "home" })
    ]
  },
  {
    match: /chair|aeron|office/i,
    candidates: [
      candidate("herman-miller-aeron", "Herman Miller Aeron", "Ergonomic mesh office chair", 0.61, 1495, { brand: "Herman Miller", model: "Aeron", category: "furniture" }),
      candidate("steelcase-series-1", "Steelcase Series 1", "Ergonomic office chair", 0.25, 499, { brand: "Steelcase", model: "Series 1", category: "furniture" }),
      candidate("generic-office-chair", "Generic mesh office chair", "Office chair; exact model unknown", 0.14, 180, { brand: "Unknown", model: "Unknown", category: "furniture" })
    ]
  }
];

const DEFAULT_CANDIDATES = [
  candidate("logitech-mx-keys-mini", "Logitech MX Keys Mini", "Compact wireless keyboard", 0.55, 100, { brand: "Logitech", model: "MX Keys Mini", category: "electronics" }),
  candidate("logitech-k380", "Logitech K380", "Compact Bluetooth keyboard", 0.27, 40, { brand: "Logitech", model: "K380", category: "electronics" }),
  candidate("apple-magic-keyboard", "Apple Magic Keyboard", "Bluetooth keyboard", 0.18, 99, { brand: "Apple", model: "Magic Keyboard", category: "electronics" })
];

function candidate(id, name, description, confidence, referencePrice, attributes) {
  return { id, name, description, confidence, referencePrice, attributes };
}

function ensureCandidates(payload) {
  if (!payload || !Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    throw new Error("Vision provider returned no identification candidates.");
  }

  return payload.candidates.slice(0, 3).map((item, index) => ({
    id: item.id ?? `provider-candidate-${index + 1}`,
    name: String(item.name),
    description: String(item.description ?? ""),
    confidence: Number(item.confidence ?? 0),
    referencePrice: Number(item.referencePrice ?? 0),
    attributes: item.attributes ?? { brand: "Unknown", model: "Unknown", category: "other" }
  }));
}

function visionToCandidate(vision) {
  const modelKnown = vision.model_number !== MODEL_UNKNOWN;
  const name = [vision.brand, vision.product_name].filter((part) => part && part.toLowerCase() !== "unknown").join(" ").trim();

  return {
    id: "pioneer-vision",
    name: name || vision.product_name,
    description: modelKnown ? `Model number read from the item: ${vision.model_number}` : "No model number was legible in the photo.",
    confidence: vision.confidence,
    referencePrice: null,
    attributes: {
      brand: vision.brand || "Unknown",
      model: modelKnown ? vision.model_number : "Unknown",
      category: vision.category || "other"
    }
  };
}

export async function identifyPhoto({ imageName, imageDataUrl }) {
  // Gemini first: Pioneer's catalogue has no vision-capable model.
  if (isGeminiConfigured() || isVisionConfigured()) {
    const useGemini = isGeminiConfigured();
    const vision = useGemini ? await identifyWithGemini(imageDataUrl) : await identifyProductWithFallback(imageDataUrl);
    const identification = buildIdentification([visionToCandidate(vision)], useGemini ? "gemini-vision" : "pioneer-vision");
    return {
      ...identification,
      vision,
      needsModelNumber: vision.model_number === MODEL_UNKNOWN,
      modelNumberSource: vision.model_number === MODEL_UNKNOWN ? "user_input" : "vision",
      fieldsEditable: vision.confidence < 0.5
    };
  }

  if (process.env.VISION_IDENTIFIER_URL) {
    const response = await fetch(process.env.VISION_IDENTIFIER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.VISION_IDENTIFIER_TOKEN ? { authorization: `Bearer ${process.env.VISION_IDENTIFIER_TOKEN}` } : {})
      },
      body: JSON.stringify({ imageName, imageDataUrl })
    });

    if (!response.ok) throw new Error(`Vision provider failed with status ${response.status}.`);
    const candidates = ensureCandidates(await response.json());
    return buildIdentification(candidates, "vision-provider");
  }

  const name = imageName || "";
  const catalog = CATALOGS.find((entry) => entry.match.test(name));
  return buildIdentification(catalog?.candidates ?? DEFAULT_CANDIDATES, "demo-fallback");
}

function buildIdentification(candidates, source) {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  return {
    source,
    requiresChoice: sorted[0].confidence < 0.8,
    candidates: sorted
  };
}

/** `brand product model` with MODEL_UNKNOWN stripped — the comps lookup input. */
export function buildCompsQuery({ brand, name, modelNumber }) {
  const words = [brand, name, modelNumber]
    .map((part) => String(part ?? "").trim())
    .filter((part) => part && part !== MODEL_UNKNOWN && part.toLowerCase() !== "unknown")
    .flatMap((part) => part.split(/\s+/));

  const seen = new Set();
  return words
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

export function confirmIdentification({ identification, candidateId, condition = "unknown", modelNumber, name }) {
  const candidate = identification.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Choose one of the suggested products before continuing.");

  const typedModel = String(modelNumber ?? "").trim();
  const visionModel = candidate.attributes.model;
  const resolvedModel = typedModel || (visionModel && visionModel !== "Unknown" ? visionModel : "");
  if (identification.needsModelNumber && !typedModel) {
    throw new Error("Type the model or part number before continuing; it was not legible in the photo.");
  }

  const confirmedName = String(name ?? "").trim() || candidate.name;
  const attributes = { ...candidate.attributes, model: resolvedModel || "Unknown" };

  return {
    id: crypto.randomUUID(),
    status: "identified",
    name: confirmedName,
    category: attributes.category,
    attributes,
    condition,
    identificationConfidence: candidate.confidence,
    modelNumber: resolvedModel || MODEL_UNKNOWN,
    modelNumberSource: typedModel ? "user_input" : identification.modelNumberSource ?? "vision",
    compsQuery: buildCompsQuery({ brand: attributes.brand, name: confirmedName, modelNumber: resolvedModel }),
    naivePrice: createNaivePrice(candidate, condition),
    nextStage: "naive_pricing"
  };
}
