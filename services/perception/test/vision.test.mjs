import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_MODEL,
  HARD_CASE_MODEL,
  MODEL_UNKNOWN,
  PRIMARY_MODEL,
  identifyProductWithFallback,
  parseIdentificationResponse
} from "../src/vision.mjs";

const IMAGE = "data:image/jpeg;base64,AA==";
const silent = () => {};

function textResponse(body) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: "text", text: body }] })
  };
}

function stubPioneer(responders) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const model = JSON.parse(options.body).model;
    calls.push(model);
    return responders[model]?.() ?? { ok: false, status: 500 };
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    }
  };
}

test.beforeEach(() => {
  process.env.PIONEER_API_KEY = "pio_sk_test";
});

test("strips markdown fences and preamble-free JSON", () => {
  const result = parseIdentificationResponse('```json\n{"product_name":"WH-1000XM5","brand":"Sony","category":"Electronics","model_number":"WH-1000XM5","confidence":0.9}\n```');
  assert.equal(result.brand, "Sony");
  assert.equal(result.category, "electronics");
  assert.equal(result.confidence, 0.9);
});

test("missing keys are rejected", () => {
  assert.throws(() => parseIdentificationResponse('{"product_name":"Lamp"}'), /Missing required keys/);
});

test("a blank model number becomes MODEL_UNKNOWN", () => {
  const result = parseIdentificationResponse('{"product_name":"Lamp","brand":"IKEA","category":"home","model_number":"  ","confidence":0.7}');
  assert.equal(result.model_number, MODEL_UNKNOWN);
});

test("a visible model sticker returns the real model number", async () => {
  const stub = stubPioneer({
    [PRIMARY_MODEL]: () => textResponse('{"product_name":"WH-1000XM5","brand":"Sony","category":"electronics","model_number":"WH-1000XM5","confidence":0.93}')
  });
  try {
    const result = await identifyProductWithFallback(IMAGE, { log: silent });
    assert.equal(result.model_number, "WH-1000XM5");
    assert.equal(result.model, PRIMARY_MODEL);
    assert.deepEqual(stub.calls, [PRIMARY_MODEL]);
  } finally {
    stub.restore();
  }
});

test("no visible model number returns MODEL_UNKNOWN without escalating", async () => {
  const stub = stubPioneer({
    [PRIMARY_MODEL]: () => textResponse(`{"product_name":"Table lamp","brand":"IKEA","category":"home","model_number":"${MODEL_UNKNOWN}","confidence":0.66}`)
  });
  try {
    const result = await identifyProductWithFallback(IMAGE, { log: silent });
    assert.equal(result.model_number, MODEL_UNKNOWN);
    assert.deepEqual(stub.calls, [PRIMARY_MODEL]);
  } finally {
    stub.restore();
  }
});

test("garbage from the primary model falls back to the cheap second model", async () => {
  const stub = stubPioneer({
    [PRIMARY_MODEL]: () => textResponse("Sure! Here is the item you asked about."),
    [FALLBACK_MODEL]: () => textResponse('{"product_name":"Aeron","brand":"Herman Miller","category":"furniture","model_number":"AER1B23","confidence":0.81}')
  });
  try {
    const result = await identifyProductWithFallback(IMAGE, { log: silent });
    assert.equal(result.model, FALLBACK_MODEL);
    assert.deepEqual(stub.calls, [PRIMARY_MODEL, FALLBACK_MODEL]);
  } finally {
    stub.restore();
  }
});

test("both cheap models failing escalates once to the hard-case model", async () => {
  const stub = stubPioneer({
    [PRIMARY_MODEL]: () => ({ ok: false, status: 429 }),
    [FALLBACK_MODEL]: () => ({ ok: false, status: 500 }),
    [HARD_CASE_MODEL]: () => textResponse('{"product_name":"Keyboard","brand":"Logitech","category":"electronics","model_number":"K380","confidence":0.88}')
  });
  try {
    const result = await identifyProductWithFallback(IMAGE, { log: silent });
    assert.equal(result.model, HARD_CASE_MODEL);
    assert.deepEqual(stub.calls, [PRIMARY_MODEL, FALLBACK_MODEL, HARD_CASE_MODEL]);
  } finally {
    stub.restore();
  }
});

test("every attempt failing raises one clean error", async () => {
  const stub = stubPioneer({});
  try {
    await assert.rejects(
      identifyProductWithFallback(IMAGE, { log: silent }),
      /All identification attempts failed\./
    );
    assert.equal(stub.calls.length, 3);
  } finally {
    stub.restore();
  }
});
