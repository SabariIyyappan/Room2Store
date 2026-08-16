import test from "node:test";
import assert from "node:assert/strict";
import { handleDealMessage } from "../src/deal-flow.mjs";
import { dealForBuyer, resetDeals } from "../src/deals.mjs";
import { insertListing, resetStore, upsertSeller } from "../src/store.mjs";

const BUYER = "chat-buyer";
const SELLER = "chat-seller";

function sent() {
  const messages = [];
  return {
    messages,
    send: async (chatId, text) => {
      messages.push({ chatId, text });
    },
    to: (chatId) => messages.filter((message) => message.chatId === chatId).map((message) => message.text),
    last: (chatId) => messages.filter((message) => message.chatId === chatId).at(-1)?.text ?? ""
  };
}

async function livePricedListing({ price = 145, floorPrice = 118 } = {}) {
  resetStore();
  resetDeals();
  const seller = await upsertSeller({ chatId: SELLER });
  await insertListing({
    id: "listing-1",
    code: "R2S-7QK4",
    sellerId: seller.id,
    sellerChatId: SELLER,
    name: "blue plastic stacking chair",
    condition: "good",
    photoUrl: null,
    price,
    floorPrice,
    priceStatus: price == null ? "being_measured" : "measured",
    status: "live",
    location: { zip: "94107", city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194 }
  });
}

const deps = (log) => ({
  send: log.send,
  createCheckoutSession: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" })
});

test("a listing code starts a negotiation and shows the item", async () => {
  await livePricedListing();
  const log = sent();

  const result = await handleDealMessage({ chatId: BUYER, text: "I want R2S-7QK4", eventId: "e1", deps: deps(log) });
  assert.equal(result.status, "negotiating");
  assert.match(log.last(BUYER), /blue plastic stacking chair/);
  assert.match(log.last(BUYER), /Asking: \$145/);
});

test("an unknown code is reported rather than ignored", async () => {
  await livePricedListing();
  const log = sent();
  const result = await handleDealMessage({ chatId: BUYER, text: "R2S-ZZZZ", eventId: "e1", deps: deps(log) });
  assert.equal(result.status, "unknown_code");
});

test("a lowball is refused at the floor and never accepted", async () => {
  await livePricedListing();
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });

  const result = await handleDealMessage({ chatId: BUYER, text: "would you take 40?", eventId: "e2", deps: deps(log) });
  assert.equal(result.status, "refused");
  assert.match(log.last(BUYER), /lowest I can go is \$118/);
  assert.equal(log.to(SELLER).length, 0, "the seller must not be bothered by a lowball");
});

test("an unpriced listing cannot be negotiated", async () => {
  await livePricedListing({ price: null, floorPrice: null });
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });

  const result = await handleDealMessage({ chatId: BUYER, text: "$50", eventId: "e2", deps: deps(log) });
  assert.equal(result.status, "not_priced");
  assert.match(log.last(BUYER), /not been priced yet/);
});

test("accepting the asking price asks the seller before anything is arranged", async () => {
  await livePricedListing();
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });

  const result = await handleDealMessage({ chatId: BUYER, text: "yes", eventId: "e2", deps: deps(log) });
  assert.equal(result.status, "awaiting_seller");
  assert.match(log.last(SELLER), /You have a buyer/);
  assert.match(log.last(SELLER), /\$145/);
});

test("the whole path runs: offer, seller yes, pickup details, payment link", async () => {
  await livePricedListing();
  const log = sent();

  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });
  await handleDealMessage({ chatId: BUYER, text: "yes", eventId: "e2", deps: deps(log) });

  const approved = await handleDealMessage({ chatId: SELLER, text: "YES", eventId: "e3", deps: deps(log) });
  assert.equal(approved.status, "awaiting_pickup_details");
  assert.match(log.last(SELLER), /pickup address and a time/);

  const arranged = await handleDealMessage({
    chatId: SELLER,
    text: "500 Howard St San Francisco, tomorrow 6pm",
    eventId: "e4",
    deps: deps(log)
  });
  assert.equal(arranged.status, "awaiting_payment");

  const toBuyer = log.last(BUYER);
  assert.match(toBuyer, /seller accepted \$145/);
  assert.match(toBuyer, /500 Howard St San Francisco/);
  assert.match(toBuyer, /tomorrow 6pm/);
  assert.match(toBuyer, /checkout\.stripe\.com/);
});

test("a seller declining returns the buyer to negotiating, not to a dead end", async () => {
  await livePricedListing();
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });
  await handleDealMessage({ chatId: BUYER, text: "yes", eventId: "e2", deps: deps(log) });

  const declined = await handleDealMessage({ chatId: SELLER, text: "no", eventId: "e3", deps: deps(log) });
  assert.equal(declined.status, "seller_declined");
  assert.match(log.last(BUYER), /seller passed on that price/);
  assert.equal(dealForBuyer(BUYER).state, "buyer_offering");
});

test("a message from someone with no deal is left to the selling path", async () => {
  await livePricedListing();
  const log = sent();
  const result = await handleDealMessage({ chatId: "chat-stranger", text: "hello", eventId: "e1", deps: deps(log) });
  assert.equal(result.handled, false);
});

test("accepting the agent's own counter is honoured, not countered again", async () => {
  await livePricedListing();
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });

  // The agent names the floor after a lowball...
  await handleDealMessage({ chatId: BUYER, text: "would you take 40?", eventId: "e2", deps: deps(log) });
  assert.match(log.last(BUYER), /lowest I can go is \$118/);

  // ...so saying yes to it must close at that number, not reopen the haggle.
  const accepted = await handleDealMessage({ chatId: BUYER, text: "yes", eventId: "e3", deps: deps(log) });
  assert.equal(accepted.status, "awaiting_seller", "the agent must not renege on a price it named");
  assert.match(log.last(SELLER), /\$118/);
});

test("asking for a lower price without naming one gets a real counter", async () => {
  await livePricedListing();
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });

  const result = await handleDealMessage({ chatId: BUYER, text: "Can I get to a lower price", eventId: "e2", deps: deps(log) });
  assert.equal(result.status, "countered", "a haggle must not fall through to the selling script");
  assert.doesNotMatch(log.last(BUYER), /Send a photo/);
  assert.match(log.last(BUYER), /I can do \$\d+/);
});

test("a softened price never dips below the measured floor", async () => {
  await livePricedListing({ price: 120, floorPrice: 118 });
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });
  await handleDealMessage({ chatId: BUYER, text: "too expensive", eventId: "e2", deps: deps(log) });

  const offered = Number(/\$(\d+)/.exec(log.last(BUYER))[1]);
  assert.ok(offered >= 118, `softened to ${offered}, below the floor`);
});

test("the seller can counter instead of only yes or no", async () => {
  await livePricedListing();
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });
  await handleDealMessage({ chatId: BUYER, text: "yes", eventId: "e2", deps: deps(log) });

  const countered = await handleDealMessage({ chatId: SELLER, text: "140", eventId: "e3", deps: deps(log) });
  assert.equal(countered.status, "seller_countered");
  assert.match(log.last(BUYER), /countered at \$140/);

  // The seller named 140, so accepting it must not bounce back for approval.
  const accepted = await handleDealMessage({ chatId: BUYER, text: "yes", eventId: "e4", deps: deps(log) });
  assert.equal(accepted.status, "awaiting_pickup_details");
  assert.match(log.last(SELLER), /pickup address and a time/);
});

test("a failed message to the other party still answers the person in front of us", async () => {
  await livePricedListing();
  const log = sent();
  await handleDealMessage({ chatId: BUYER, text: "R2S-7QK4", eventId: "e1", deps: deps(log) });

  const flaky = {
    createCheckoutSession: async () => ({ id: "cs", url: "https://checkout.stripe.com/pay/cs" }),
    send: async (chatId, text) => {
      if (chatId === SELLER) throw new Error("Linq reply failed with status 400.");
      log.messages.push({ chatId, text });
    }
  };

  const result = await handleDealMessage({ chatId: BUYER, text: "yes", eventId: "e2", deps: flaky });
  assert.equal(result.status, "awaiting_seller");
  assert.match(log.last(BUYER), /Offer of \$145/, "the buyer must still hear back");
});
