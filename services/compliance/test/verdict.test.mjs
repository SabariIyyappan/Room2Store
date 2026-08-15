import test from "node:test";
import assert from "node:assert/strict";
import { canDeploy, reviewItem } from "../src/verdict.mjs";

const item = (overrides = {}) => ({
  id: "item-1",
  name: "Sony WH-1000XM5",
  category: "electronics",
  attributes: { brand: "Sony", model: "WH-1000XM5", category: "electronics" },
  ...overrides
});

test("a clean item is approved and may deploy", () => {
  const verdict = reviewItem({ item: item(), listingCopy: "Used headphones, some wear on the headband." });
  assert.equal(verdict.decision, "approve");
  assert.deepEqual(verdict.rulesTriggered, []);
  assert.equal(canDeploy(verdict), true);
});

test("a prohibited category is vetoed and blocks deploy", () => {
  const verdict = reviewItem({ item: item({ name: "Graco infant car seat", category: "baby" }) });
  assert.equal(verdict.decision, "veto");
  assert.ok(verdict.rulesTriggered.includes("prohibited_car_seat"));
  assert.equal(canDeploy(verdict), false);
});

test("an unverifiable claim asks for a rewrite", () => {
  const verdict = reviewItem({ item: item(), listingCopy: "Brand new, still under warranty." });
  assert.equal(verdict.decision, "revise");
  assert.ok(verdict.rulesTriggered.includes("claim_brand_new"));
  assert.equal(canDeploy(verdict), false);
});

test("an excluded object is vetoed", () => {
  const verdict = reviewItem({ item: item({ name: "MacBook laptop" }), exclusions: ["laptop"] });
  assert.equal(verdict.decision, "veto");
  assert.ok(verdict.rulesTriggered.includes("excluded_object:laptop"));
});

test("a street address in public copy is vetoed", () => {
  const verdict = reviewItem({ item: item(), listingCopy: "Pickup at 221 Baker Street after 6pm." });
  assert.equal(verdict.decision, "veto");
  assert.ok(verdict.rulesTriggered.includes("unsafe_pickup_address"));
});

test("messaging an opted-out contact is vetoed", () => {
  const verdict = reviewItem({ item: item(), contactOptedIn: false });
  assert.equal(verdict.decision, "veto");
  assert.ok(verdict.rulesTriggered.includes("contact_not_opted_in"));
});
