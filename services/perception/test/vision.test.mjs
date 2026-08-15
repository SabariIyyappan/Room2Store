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
    json: async () => ({ choices: [{ message: { role: "assistant", content: body } }] })
  };
}

function stubPioneer(responders) {
  const calls = [];
  const requests = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const parsed = JSON.parse(options.body);
    calls.push(parsed.model);
    requests.push({ url, headers: options.headers, body: parsed });
    return responders[parsed.model]?.() ?? { ok: false, status: 500, text: async () => "no stub" };
  };
  return {
    calls,
    requests,
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

test("it calls the OpenAI-compatible endpoint with bearer auth and an image part", async () => {
  const stub = stubPioneer({
    [PRIMARY_MODEL]: () => textResponse('{"product_name":"chair","brand":"Unknown","category":"furniture","model_number":"MODEL_UNKNOWN","confidence":0.8}')
  });
  try {
    await identifyProductWithFallback(IMAGE, { log: silent });
    const request = stub.requests[0];
    assert.match(request.url, /\/v1\/chat\/completions$/);
    assert.equal(request.headers.authorization, "Bearer pio_sk_test");
    assert.equal(request.body.messages[0].role, "system");
    assert.equal(request.body.messages[1].content[0].type, "image_url");
    assert.match(request.body.messages[1].content[0].image_url.url, /^data:image\/jpeg;base64,/);
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
