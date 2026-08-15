import test from "node:test";
import assert from "node:assert/strict";
import {
  itemAwaitingCondition,
  itemAwaitingLocation,
  recordItem,
  resetSessions,
  setCondition,
  setLocation,
  startTurn
} from "../src/sessions.mjs";
import { describeInboundLinqMessage, formatListingPublished, formatLocationRequest } from "../src/linq.mjs";

const SF = { zip: "94107", city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194 };

const NOW = 1_770_000_000_000;
const textEvent = (value) => ({
  event_type: "message.received",
  data: { chat: { id: "chat-1" }, parts: [{ type: "text", value }] }
});

test.beforeEach(() => resetSessions());

function identifiedChair() {
  startTurn("chat-1", NOW);
  recordItem("chat-1", { name: "blue plastic stacking chair", modelNumber: "MODEL_UNKNOWN" }, NOW);
  return startTurn("chat-1", NOW + 30_000);
}

test("an identified item waits for its condition", () => {
  const session = identifiedChair();
  assert.equal(session.awaitingCondition, true);
  assert.equal(itemAwaitingCondition("chat-1").name, "blue plastic stacking chair");
});

test("a condition reply is recognised and normalised", () => {
  const session = identifiedChair();
  const result = describeInboundLinqMessage(textEvent("good"), session);
  assert.equal(result.condition, "good");

  const item = setCondition("chat-1", result.condition);
  assert.equal(item.condition, "good");
  assert.equal(item.status, "awaiting_location");
});

test("the condition is followed by asking where the item is", () => {
  identifiedChair();
  const item = setCondition("chat-1", "good");
  assert.equal(itemAwaitingLocation("chat-1"), item);

  const ask = formatLocationRequest(item);
  assert.match(ask, /blue plastic stacking chair, good condition/);
  assert.match(ask, /What ZIP code is it in for pickup/);
});

test("a ZIP is only read as a location while an item is waiting for one", () => {
  identifiedChair();
  setCondition("chat-1", "good");
  const waiting = startTurn("chat-1", NOW + 60_000);
  assert.equal(describeInboundLinqMessage(textEvent("94107"), waiting).zip, "94107");

  setLocation("chat-1", SF);
  const settled = startTurn("chat-1", NOW + 90_000);
  assert.equal(describeInboundLinqMessage(textEvent("94107"), settled).zip, undefined);
});

test("'like new' and 'used' map onto the known conditions", () => {
  identifiedChair();
  assert.equal(describeInboundLinqMessage(textEvent("like new"), { awaitingCondition: true }).condition, "new");
  assert.equal(describeInboundLinqMessage(textEvent("used"), { awaitingCondition: true }).condition, "good");
});

test("the published listing names the item, condition and pickup place", () => {
  identifiedChair();
  setCondition("chat-1", "good");
  const item = setLocation("chat-1", SF);
  const published = formatListingPublished(item);

  assert.match(published, /Your listing is live:/);
  assert.match(published, /blue plastic stacking chair/);
  assert.match(published, /Condition: good/);
  assert.match(published, /Pickup: San Francisco, CA/);
  assert.equal(item.status, "ready_to_publish");
});

test("no price is quoted until one has actually been measured", () => {
  identifiedChair();
  setCondition("chat-1", "good");
  const item = setLocation("chat-1", SF);

  const pending = formatListingPublished(item);
  assert.match(pending, /Price: being measured now/);
  assert.doesNotMatch(pending, /\$\d/, "an unmeasured item must never show a number");

  item.measuredPrice = 45;
  assert.match(formatListingPublished(item), /Price: \$45/);
});

test("the listing links to the website when one is configured", () => {
  identifiedChair();
  setCondition("chat-1", "good");
  const item = setLocation("chat-1", SF);

  assert.doesNotMatch(formatListingPublished(item), /See it here/);
  assert.match(formatListingPublished(item, { webUrl: "https://room2store.example" }), /See it here: https:\/\/room2store\.example/);
});

test("a condition word means nothing when no item is waiting", () => {
  startTurn("chat-1", NOW);
  const session = startTurn("chat-1", NOW + 30_000);
  const result = describeInboundLinqMessage(textEvent("good"), session);
  assert.equal(result.condition, undefined);
  assert.match(result.reply, /Send a photo of the item/);
});

test("the item is no longer awaiting a condition once given", () => {
  identifiedChair();
  setCondition("chat-1", "fair");
  assert.equal(itemAwaitingCondition("chat-1"), null);
  assert.equal(startTurn("chat-1", NOW + 60_000).awaitingCondition, false);
});
