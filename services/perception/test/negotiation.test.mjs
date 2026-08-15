import test from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_FEE_RATE, evaluateOffer, parseListingCode, parseOffer, splitPayment } from "../src/negotiation.mjs";

test("the platform takes ten percent and the seller keeps ninety", () => {
  const split = splitPayment(145);
  assert.equal(split.amountCents, 14500);
  assert.equal(split.platformFeeCents, 1450);
  assert.equal(split.sellerPayoutCents, 13050);
  assert.equal(split.platformFeeCents + split.sellerPayoutCents, split.amountCents, "the split must never lose a cent");
});

test("rounding never loses or invents a cent", () => {
  for (const amount of [0.01, 9.99, 33.33, 145, 1234.56]) {
    const split = splitPayment(amount);
    assert.equal(split.platformFeeCents + split.sellerPayoutCents, split.amountCents, `failed at ${amount}`);
  }
});

test("an offer at or above the asking price is accepted", () => {
  assert.equal(evaluateOffer({ offer: 145, price: 145, floorPrice: 118 }).action, "accept");
  assert.equal(evaluateOffer({ offer: 200, price: 145, floorPrice: 118 }).action, "accept");
});

test("an offer below the floor is refused, and countered at the floor", () => {
  const result = evaluateOffer({ offer: 50, price: 145, floorPrice: 118 });
  assert.equal(result.action, "refuse");
  assert.equal(result.reason, "below_floor");
  assert.equal(result.counterOffer, 118);
});

test("an offer between floor and asking price gets one counter, then is accepted", () => {
  const first = evaluateOffer({ offer: 120, price: 145, floorPrice: 118, previousCounters: 0 });
  assert.equal(first.action, "counter");
  assert.ok(first.counterOffer > 120 && first.counterOffer <= 145);

  const second = evaluateOffer({ offer: 120, price: 145, floorPrice: 118, previousCounters: 1 });
  assert.equal(second.action, "accept");
});

test("without measured evidence the agent refuses to negotiate at all", () => {
  assert.equal(evaluateOffer({ offer: 100, price: null, floorPrice: null }).action, "cannot_negotiate");
  assert.equal(evaluateOffer({ offer: 100, price: 145, floorPrice: null }).action, "cannot_negotiate");
});

test("no wording talks the agent below the floor", () => {
  for (const offer of [1, 10, 117, 117.99]) {
    const result = evaluateOffer({ offer, price: 145, floorPrice: 118, previousCounters: 5 });
    assert.notEqual(result.action, "accept", `accepted ${offer}, which is below the floor`);
  }
});

test("offers are read out of ordinary sentences", () => {
  assert.equal(parseOffer("would you take 40?"), 40);
  assert.equal(parseOffer("$40"), 40);
  assert.equal(parseOffer("I'll give you 39.50 for it"), 39.5);
  assert.equal(parseOffer("no numbers here"), null);
});

test("listing codes are read in any case or spacing", () => {
  assert.equal(parseListingCode("I want R2S-7QK4"), "R2S-7QK4");
  assert.equal(parseListingCode("r2s 7qk4 please"), "R2S-7QK4");
  assert.equal(parseListingCode("hello"), null);
});

test("the fee rate is ten percent", () => {
  assert.equal(PLATFORM_FEE_RATE, 0.1);
});
