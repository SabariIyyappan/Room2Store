import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_FAILED, formatIdentificationReply } from "../src/linq.mjs";
import { MODEL_UNKNOWN } from "../src/vision.mjs";

const identification = (vision, extra = {}) => ({ vision, needsModelNumber: vision.model_number === MODEL_UNKNOWN, fieldsEditable: false, ...extra });

test("a known brand and model are both named", () => {
  const reply = formatIdentificationReply(identification({
    product_name: "WH-1000XM5", brand: "Sony", category: "electronics", model_number: "WH-1000XM5", confidence: 0.93
  }));
  assert.match(reply, /Looks like a used Sony WH-1000XM5\./);
  assert.match(reply, /Model number on it: WH-1000XM5/);
  assert.match(reply, /What condition is it in/);
});

test("no visible brand still produces a usable marketplace name", () => {
  const reply = formatIdentificationReply(identification({
    product_name: "black mesh office chair", brand: "Unknown", category: "furniture", model_number: MODEL_UNKNOWN, confidence: 0.55
  }));
  assert.match(reply, /Looks like a used black mesh office chair\./);
  assert.doesNotMatch(reply, /Unknown/);
  assert.doesNotMatch(reply, /MODEL_UNKNOWN/);
});

test("a missing model number is an optional extra, never a blocker", () => {
  const reply = formatIdentificationReply(identification({
    product_name: "white ceramic table lamp", brand: "Unknown", category: "home", model_number: MODEL_UNKNOWN, confidence: 0.6
  }));
  assert.match(reply, /If you can find a model or part number/);
  assert.match(reply, /What condition is it in/, "the flow must still move forward without a model number");
});

test("low confidence invites a correction", () => {
  const reply = formatIdentificationReply(identification({
    product_name: "wooden side table", brand: "Unknown", category: "furniture", model_number: MODEL_UNKNOWN, confidence: 0.3
  }, { fieldsEditable: true }));
  assert.match(reply, /Correct me if I have got the item wrong\./);
});

test("no identification at all falls back without promising a follow-up", () => {
  const reply = formatIdentificationReply(null);
  assert.equal(reply, PHOTO_FAILED);
  assert.doesNotMatch(reply, /shortly|will send|identifying/i);
});
