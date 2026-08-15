import test from "node:test";
import assert from "node:assert/strict";
import { confirmIdentification, identifyPhoto } from "../src/catalog.mjs";

test("uses an explicit choice when the demo result is uncertain", async () => {
  const result = await identifyPhoto({ imageName: "desk-item.jpg", imageDataUrl: "data:image/jpeg;base64,AA==" });
  assert.equal(result.source, "demo-fallback");
  assert.equal(result.requiresChoice, true);
  assert.equal(result.candidates.length, 3);
});

test("confirmation creates the handoff to naive pricing", async () => {
  const identification = await identifyPhoto({ imageName: "headphones.jpg", imageDataUrl: "data:image/jpeg;base64,AA==" });
  const item = confirmIdentification({ identification, candidateId: "sony-wh-1000xm5", condition: "good" });
  assert.equal(item.status, "identified");
  assert.equal(item.nextStage, "naive_pricing");
  assert.equal(item.naivePrice.amount, 200);
});
