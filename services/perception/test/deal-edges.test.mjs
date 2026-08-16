import test from "node:test";
import assert from "node:assert/strict";
import { handleDealMessage } from "../src/deal-flow.mjs";
import { dealForSeller, isOptOut, resetDeals } from "../src/deals.mjs";
import { publishListing, setMeasuredPrice } from "../src/listings.mjs";
import { findListingByCode, findListingById, resetStore, updateListing } from "../src/store.mjs";

const SF = { zip: "94107", city: "SF", state: "CA", latitude: 37.77, longitude: -122.41 };

function recorder() {
  const messages = [];
  return {
    messages,
    deps: {
      send: async (chatId, text) => { messages.push({ chatId, text }); },
      createCheckoutSession: async () => ({ id: "cs", url: "https://pay/cs" })
    },
    to: (chatId) => messages.filter((m) => m.chatId === chatId).map((m) => m.text),
    last: (chatId) => messages.filter((m) => m.chatId === chatId).at(-1)?.text ?? ""
  };
}

async function listItem(name, sellerChatId, price = null, floorPrice = null) {
  const listing = await publishListing({ name, condition: "good", sellerChatId, location: SF });
  if (price != null) await setMeasuredPrice(listing.id, price, { floorPrice });
  return (await findListingById(listing.id)).code;
}

test.beforeEach(() => { resetStore(); resetDeals(); });

test("a sold item cannot be negotiated again", async () => {
  const log = recorder();
  const code = await listItem("one of a kind", "S", 100, 80);
  const sold = await findListingByCode(code);
  await updateListing(sold.id, { status: "sold" });

  const result = await handleDealMessage({ chatId: "B", text: code, eventId: "1", deps: log.deps });
  assert.notEqual(result.status, "negotiating", "two buyers agreeing on one item costs someone real money");
  assert.match(log.last("B"), /no longer available/);
});

test("yes on an unpriced item is refused, not dropped into the selling script", async () => {
  const log = recorder();
  const code = await listItem("unpriced", "S");
  await handleDealMessage({ chatId: "B", text: code, eventId: "1", deps: log.deps });

  const result = await handleDealMessage({ chatId: "B", text: "yes", eventId: "2", deps: log.deps });
  assert.equal(result.status, "not_priced");
  assert.doesNotMatch(log.last("B"), /Send a photo/);
});

test("an unrecognised message mid-deal keeps the buyer in the negotiation", async () => {
  const log = recorder();
  const code = await listItem("chair", "S", 100, 80);
  await handleDealMessage({ chatId: "B", text: code, eventId: "1", deps: log.deps });

  const result = await handleDealMessage({ chatId: "B", text: "is it still available?", eventId: "2", deps: log.deps });
  assert.equal(result.handled, true);
  assert.match(log.last("B"), /Still talking about the chair/);
  assert.doesNotMatch(log.last("B"), /Send a photo/);
});

test("a second offer to the same seller does not orphan the first buyer", async () => {
  const log = recorder();
  const first = await listItem("item ONE", "S", 100, 80);
  const second = await listItem("item TWO", "S", 200, 160);

  await handleDealMessage({ chatId: "B1", text: first, eventId: "1", deps: log.deps });
  await handleDealMessage({ chatId: "B1", text: "yes", eventId: "2", deps: log.deps });
  await handleDealMessage({ chatId: "B2", text: second, eventId: "3", deps: log.deps });
  await handleDealMessage({ chatId: "B2", text: "yes", eventId: "4", deps: log.deps });

  const seller = log.to("S").join(" | ");
  assert.match(seller, /ONE/);
  assert.match(seller, /TWO/);

  // The seller answers the offer they were asked about first.
  assert.equal(dealForSeller("S").listingName, "item ONE");
});

test("one item never yields two payment links", async () => {
  const log = recorder();
  const code = await listItem("single", "S", 100, 80);

  await handleDealMessage({ chatId: "BX", text: code, eventId: "1", deps: log.deps });
  await handleDealMessage({ chatId: "BY", text: code, eventId: "2", deps: log.deps });
  await handleDealMessage({ chatId: "BX", text: "yes", eventId: "3", deps: log.deps });
  await handleDealMessage({ chatId: "BY", text: "yes", eventId: "4", deps: log.deps });
  await handleDealMessage({ chatId: "S", text: "YES", eventId: "5", deps: log.deps });
  await handleDealMessage({ chatId: "S", text: "1 Rd, 4pm", eventId: "6", deps: log.deps });

  const links = log.messages.filter((m) => m.text.includes("https://pay/cs")).length;
  assert.ok(links <= 1, `${links} payment links issued for one item`);
});

test("pickup details sent twice do not charge twice", async () => {
  const log = recorder();
  const code = await listItem("dbl", "S", 100, 80);
  await handleDealMessage({ chatId: "B", text: code, eventId: "1", deps: log.deps });
  await handleDealMessage({ chatId: "B", text: "yes", eventId: "2", deps: log.deps });
  await handleDealMessage({ chatId: "S", text: "YES", eventId: "3", deps: log.deps });
  await handleDealMessage({ chatId: "S", text: "1 Main St, 6pm", eventId: "4", deps: log.deps });

  const after = log.messages.filter((m) => m.text.includes("https://pay/cs")).length;
  await handleDealMessage({ chatId: "S", text: "1 Main St, 7pm", eventId: "5", deps: log.deps });
  assert.equal(log.messages.filter((m) => m.text.includes("https://pay/cs")).length, after);
});

test("an opt-out outranks any negotiation", async () => {
  const log = recorder();
  const code = await listItem("stop item", "S", 100, 80);
  await handleDealMessage({ chatId: "B", text: code, eventId: "1", deps: log.deps });

  const result = await handleDealMessage({ chatId: "B", text: "STOP", eventId: "2", deps: log.deps });
  assert.equal(result.handled, false, "the deal handler must never swallow an opt-out");
});

test("opt-out matching is exact, so 'stopwatch' is an item and not a STOP", () => {
  for (const word of ["STOP", "stop", "Stop please", "unsubscribe", "CANCEL"]) {
    assert.equal(isOptOut(word), true, `${word} should opt out`);
  }
  for (const word of ["stopwatch", "endtable", "hello", ""]) {
    assert.equal(isOptOut(word), false, `${word} should not opt out`);
  }
});
