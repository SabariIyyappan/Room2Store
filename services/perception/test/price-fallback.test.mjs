import test from "node:test";
import assert from "node:assert/strict";
import { estimatePrice, isPriceFallbackConfigured } from "../src/price-fallback.mjs";

function stub(reply) {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    seen.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }}] }) };
  };
  return { seen, restore: () => { globalThis.fetch = original; } };
}

test.beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; });

test("the condition is sent to the model, since it drives the discount", async () => {
  const s = stub({ retail_price: 800, asking_price: 310, floor_price: 250, reasoning: "fair" });
  try {
    await estimatePrice({ name: "QSC K12.2", condition: "fair", category: "pro audio" });
    const prompt = JSON.stringify(s.seen[0]);
    assert.match(prompt, /fair/);
    assert.match(prompt, /QSC K12\.2/);
  } finally { s.restore(); }
});

test("retail, asking and floor all come back", async () => {
  const s = stub({ retail_price: 800, asking_price: 310, floor_price: 250 });
  try {
    const r = await estimatePrice({ name: "QSC K12.2", condition: "fair" });
    assert.equal(r.ok, true);
    assert.equal(r.retailPrice, 800);
    assert.equal(r.price, 310);
    assert.equal(r.floorPrice, 250);
    assert.equal(r.source, "estimated", "it must never be labelled measured");
  } finally { s.restore(); }
});

test("a floor at or above the asking price is corrected, or negotiation is impossible", async () => {
  const s = stub({ retail_price: 800, asking_price: 300, floor_price: 350 });
  try {
    const r = await estimatePrice({ name: "x", condition: "good" });
    assert.ok(r.floorPrice < r.price, `floor ${r.floorPrice} must sit below asking ${r.price}`);
  } finally { s.restore(); }
});

test("with no key it declines rather than inventing a price", async () => {
  delete process.env.GEMINI_API_KEY;
  assert.equal(isPriceFallbackConfigured(), false);
  const r = await estimatePrice({ name: "x", condition: "good" });
  assert.equal(r.ok, false);
});
