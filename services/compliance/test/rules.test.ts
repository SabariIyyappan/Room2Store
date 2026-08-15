import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureCarSeat, fixtureItems } from "@room2store/contracts/fixtures";
import type { Item } from "@room2store/contracts";
import {
  checkExcludedObject,
  checkProhibitedCategory,
  checkPublicPii,
  checkUnsafePickupDetail,
  checkUnverifiableClaims,
} from "../src/rules.ts";

const chair = fixtureItems[0];

test("B6 flags the plan's live-demo veto: a prohibited category", () => {
  const finding = checkProhibitedCategory(fixtureCarSeat);
  assert.equal(finding?.rule, "prohibited_category");
});

test("B6 does not flag an ordinary category", () => {
  assert.equal(checkProhibitedCategory(chair), undefined);
});

test("B6 flags an item that matches the seller's exclusion list", () => {
  const passportHolder: Item = { ...chair, id: "item_passport_holder", name: "Leather passport holder", category: "accessories" };
  const finding = checkExcludedObject(passportHolder, fixtureCampaign);
  assert.equal(finding?.rule, "excluded_object");
  assert.match(finding?.message ?? "", /passport/i);
});

test("B6 does not flag an item absent from the exclusion list", () => {
  assert.equal(checkExcludedObject(chair, fixtureCampaign), undefined);
});

test("B6 flags an unverifiable 'brand new' claim in listing copy", () => {
  const claimed: Item = {
    ...chair,
    listingV1: { title: "Office chair", description: "Brand new, never used!", photoUrls: [], publicCopy: "Brand new, never used!" },
  };
  const finding = checkUnverifiableClaims(claimed);
  assert.equal(finding?.rule, "unverifiable_claim");
});

test("B6 does not flag honest condition copy", () => {
  assert.equal(checkUnverifiableClaims(chair), undefined);
});

test("B6 flags an exact street address in public copy", () => {
  const unsafe: Item = {
    ...chair,
    listingV1: { title: "Office chair", description: "Good condition.", photoUrls: [], publicCopy: "Pickup at 742 Evergreen Terrace, ring the bell." },
  };
  const finding = checkUnsafePickupDetail(unsafe);
  assert.equal(finding?.rule, "unsafe_pickup_detail");
});

test("B6 does not flag a neighborhood-level pickup description", () => {
  const safe: Item = {
    ...chair,
    listingV1: { title: "Office chair", description: "Good condition.", photoUrls: [], publicCopy: "Pickup near Mission and 24th, San Francisco." },
  };
  assert.equal(checkUnsafePickupDetail(safe), undefined);
});

test("B7 flags an email left in public copy as public_pii", () => {
  const leaked: Item = {
    ...chair,
    listingV1: { title: "Office chair", description: "Email seller@example.com with questions.", photoUrls: [], publicCopy: "Good condition." },
  };
  const finding = checkPublicPii(leaked);
  assert.equal(finding?.rule, "public_pii");
  assert.match(finding?.message ?? "", /email/i);
});

test("B7 checkPublicPii does not re-flag a street address (that's checkUnsafePickupDetail's job)", () => {
  const unsafe: Item = {
    ...chair,
    listingV1: { title: "Office chair", description: "Good condition.", photoUrls: [], publicCopy: "Pickup at 742 Evergreen Terrace, ring the bell." },
  };
  assert.equal(checkPublicPii(unsafe), undefined);
});

test("B7 does not flag clean listing copy", () => {
  assert.equal(checkPublicPii(chair), undefined);
});
