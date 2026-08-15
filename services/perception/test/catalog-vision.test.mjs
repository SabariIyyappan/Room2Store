import test from "node:test";
import assert from "node:assert/strict";
import { buildCompsQuery, confirmIdentification, identifyPhoto } from "../src/catalog.mjs";
import { MODEL_UNKNOWN, PRIMARY_MODEL } from "../src/vision.mjs";

const IMAGE = "data:image/jpeg;base64,AA==";

function stubVision(body) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: body } }] }) });
  return () => {
    globalThis.fetch = original;
  };
}

test.beforeEach(() => {
  process.env.PIONEER_API_KEY = "pio_sk_test";
  delete process.env.VISION_IDENTIFIER_URL;
});

test("a read model number flows into the item and the comps query", async () => {
  const restore = stubVision('{"product_name":"WH-1000XM5","brand":"Sony","category":"electronics","model_number":"WH-1000XM5","confidence":0.93}');
  try {
    const identification = await identifyPhoto({ imageName: "photo.jpg", imageDataUrl: IMAGE });
    assert.equal(identification.source, "pioneer-vision");
    assert.equal(identification.needsModelNumber, false);
    assert.equal(identification.modelNumberSource, "vision");
    assert.equal(identification.fieldsEditable, false);
    assert.equal(identification.vision.model, PRIMARY_MODEL);

    const item = confirmIdentification({ identification, candidateId: "pioneer-vision", condition: "good" });
    assert.equal(item.modelNumber, "WH-1000XM5");
    assert.equal(item.modelNumberSource, "vision");
    assert.equal(item.compsQuery, "Sony WH-1000XM5");
    assert.equal(item.naivePrice.status, "needs_comps");
  } finally {
    restore();
  }
});

test("MODEL_UNKNOWN blocks confirmation until the seller types the model", async () => {
  const restore = stubVision(`{"product_name":"Table lamp","brand":"IKEA","category":"home","model_number":"${MODEL_UNKNOWN}","confidence":0.41}`);
  try {
    const identification = await identifyPhoto({ imageName: "photo.jpg", imageDataUrl: IMAGE });
    assert.equal(identification.needsModelNumber, true);
    assert.equal(identification.modelNumberSource, "user_input");
    assert.equal(identification.fieldsEditable, true);

    assert.throws(
      () => confirmIdentification({ identification, candidateId: "pioneer-vision", condition: "good" }),
      /Type the model or part number/
    );

    const item = confirmIdentification({ identification, candidateId: "pioneer-vision", condition: "good", modelNumber: "FADO" });
    assert.equal(item.modelNumber, "FADO");
    assert.equal(item.modelNumberSource, "user_input");
    assert.match(item.compsQuery, /FADO$/);
  } finally {
    restore();
  }
});

test("the comps query never carries MODEL_UNKNOWN", () => {
  assert.equal(buildCompsQuery({ brand: "IKEA", name: "Table lamp", modelNumber: MODEL_UNKNOWN }), "IKEA Table lamp");
  assert.equal(buildCompsQuery({ brand: "Unknown", name: "Table lamp", modelNumber: "" }), "Table lamp");
});

test("a dead Pioneer plan falls through to Gemini rather than failing the photo", async () => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("pioneer")) {
      return { ok: false, status: 403, text: async () => '{"error":{"message":"subscribe to the Hobby or Pro plan"}}' };
    }
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"product_name":"blue plastic stacking chair","brand":"Unknown","category":"furniture","model_number":"MODEL_UNKNOWN","confidence":0.8}' }] } }] })
    };
  };

  try {
    const identification = await identifyPhoto({ imageName: "chair.jpg", imageDataUrl: IMAGE });
    assert.equal(identification.source, "gemini-vision");
    assert.equal(identification.candidates[0].name, "blue plastic stacking chair");
  } finally {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  }
});

test("every provider failing reports each real reason, not a generic error", async () => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => "subscribe to the Hobby or Pro plan" });

  try {
    await assert.rejects(
      identifyPhoto({ imageName: "chair.jpg", imageDataUrl: IMAGE }),
      (error) => /pioneer-vision:/.test(error.message) && /gemini-vision:/.test(error.message) && /Hobby or Pro plan/.test(error.message)
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  }
});
