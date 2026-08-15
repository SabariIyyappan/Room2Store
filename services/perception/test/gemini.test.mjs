import test from "node:test";
import assert from "node:assert/strict";
import { GEMINI_FALLBACK_MODEL, GEMINI_PRIMARY_MODEL, GEMINI_SAFETY_MODEL, identifyWithGemini, isGeminiConfigured } from "../src/gemini.mjs";
import { MODEL_UNKNOWN } from "../src/vision.mjs";

const IMAGE = "data:image/jpeg;base64,AA==";
const silent = () => {};

function reply(text) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
}

function stubGemini(responders) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const model = /models\/([^:]+):/.exec(url)[1];
    calls.push({ model, apiKeyHeader: options.headers["x-goog-api-key"], url });
    return responders[model]?.() ?? { ok: false, status: 500, text: async () => "boom" };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
});

test("the provider reports itself configured from the key alone", () => {
  assert.equal(isGeminiConfigured(), true);
});

test("an unbranded chair comes back with a usable resale name", async () => {
  const stub = stubGemini({
    [GEMINI_PRIMARY_MODEL]: () => reply(`{"product_name":"blue plastic stacking chair","brand":"Unknown","category":"furniture","model_number":"${MODEL_UNKNOWN}","confidence":0.82}`)
  });
  try {
    const result = await identifyWithGemini(IMAGE, { log: silent });
    assert.equal(result.product_name, "blue plastic stacking chair");
    assert.equal(result.brand, "Unknown");
    assert.equal(result.model_number, MODEL_UNKNOWN);
    assert.equal(result.model, GEMINI_PRIMARY_MODEL);
  } finally {
    stub.restore();
  }
});

test("the key travels as a header, never in the URL", async () => {
  const stub = stubGemini({
    [GEMINI_PRIMARY_MODEL]: () => reply('{"product_name":"lamp","brand":"Unknown","category":"home","model_number":"MODEL_UNKNOWN","confidence":0.5}')
  });
  try {
    await identifyWithGemini(IMAGE, { log: silent });
    assert.equal(stub.calls[0].apiKeyHeader, "test-key");
    assert.doesNotMatch(stub.calls[0].url, /test-key/, "the key must not appear in the request URL");
  } finally {
    stub.restore();
  }
});

test("a failing primary model falls back to the second", async () => {
  const stub = stubGemini({
    [GEMINI_PRIMARY_MODEL]: () => ({ ok: false, status: 429, text: async () => "rate limited" }),
    [GEMINI_FALLBACK_MODEL]: () => reply('{"product_name":"wooden brown chair","brand":"Unknown","category":"furniture","model_number":"MODEL_UNKNOWN","confidence":0.7}')
  });
  try {
    const result = await identifyWithGemini(IMAGE, { log: silent });
    assert.equal(result.model, GEMINI_FALLBACK_MODEL);
    assert.deepEqual(stub.calls.map((call) => call.model), [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL]);
  } finally {
    stub.restore();
  }
});

test("an error body is surfaced, not swallowed", async () => {
  const stub = stubGemini({
    [GEMINI_PRIMARY_MODEL]: () => ({ ok: false, status: 403, text: async () => '{"error":{"message":"API key not valid"}}' }),
    [GEMINI_FALLBACK_MODEL]: () => ({ ok: false, status: 403, text: async () => '{"error":{"message":"API key not valid"}}' })
  });
  try {
    await assert.rejects(identifyWithGemini(IMAGE, { log: silent }), /API key not valid/);
  } finally {
    stub.restore();
  }
});

test("a blocked image is reported as a decline, not a parse error", async () => {
  const stub = stubGemini({
    [GEMINI_PRIMARY_MODEL]: () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }) }),
    [GEMINI_FALLBACK_MODEL]: () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }) })
  });
  try {
    await assert.rejects(identifyWithGemini(IMAGE, { log: silent }), /declined the image: SAFETY/);
  } finally {
    stub.restore();
  }
});

test("a retired pinned id degrades to the floating alias instead of failing", async () => {
  const stub = stubGemini({
    [GEMINI_PRIMARY_MODEL]: () => ({ ok: false, status: 404, text: async () => "no longer available" }),
    [GEMINI_FALLBACK_MODEL]: () => ({ ok: false, status: 404, text: async () => "no longer available" }),
    [GEMINI_SAFETY_MODEL]: () => reply('{"product_name":"blue plastic stacking chair","brand":"Unknown","category":"furniture","model_number":"MODEL_UNKNOWN","confidence":0.8}')
  });
  try {
    const result = await identifyWithGemini(IMAGE, { log: silent });
    assert.equal(result.model, GEMINI_SAFETY_MODEL);
    assert.equal(result.product_name, "blue plastic stacking chair");
  } finally {
    stub.restore();
  }
});
