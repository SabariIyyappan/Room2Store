import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureCarSeat, fixtureItems } from "@room2store/contracts/fixtures";
import type { Item } from "@room2store/contracts";
import { evaluateItem } from "../src/evaluate.ts";

test("B6 vetoes a prohibited-category item", () => {
  const verdict = evaluateItem(fixtureCarSeat, fixtureCampaign);
  assert.equal(verdict.decision, "veto");
  assert.deepEqual(verdict.rulesTriggered, ["prohibited_category"]);
  assert.equal(verdict.itemId, fixtureCarSeat.id);
});

test("B6 approves a clean item with a reason judges can read", () => {
  const verdict = evaluateItem(fixtureItems[0], fixtureCampaign);
  assert.equal(verdict.decision, "approve");
  assert.deepEqual(verdict.rulesTriggered, []);
  assert.match(verdict.reason, /no prohibited category/i);
});

test("B6 downgrades to revise (not veto) for an unverifiable claim alone", () => {
  const claimed: Item = {
    ...fixtureItems[0],
    listingV1: { title: "Office chair", description: "Brand new, never used!", photoUrls: [], publicCopy: "Brand new, never used!" },
  };
  const verdict = evaluateItem(claimed, fixtureCampaign);
  assert.equal(verdict.decision, "revise");
  assert.deepEqual(verdict.rulesTriggered, ["unverifiable_claim"]);
});

test("B7 downgrades to revise (not veto) for exposed PII alone", () => {
  const leaked: Item = {
    ...fixtureItems[0],
    listingV1: { title: "Office chair", description: "Email seller@example.com with questions.", photoUrls: [], publicCopy: "Good condition." },
  };
  const verdict = evaluateItem(leaked, fixtureCampaign);
  assert.equal(verdict.decision, "revise");
  assert.deepEqual(verdict.rulesTriggered, ["public_pii"]);
});

test("B6 vetoes over revise when both an excluded object and a claim are present", () => {
  const both: Item = {
    ...fixtureItems[0],
    id: "item_passport_holder",
    name: "Leather passport holder",
    category: "accessories",
    listingV1: { title: "Passport holder", description: "Brand new, never used!", photoUrls: [], publicCopy: "Brand new, never used!" },
  };
  const verdict = evaluateItem(both, fixtureCampaign);
  assert.equal(verdict.decision, "veto");
  assert.deepEqual(verdict.rulesTriggered.sort(), ["excluded_object", "unverifiable_claim"]);
});
