import test from "node:test";
import assert from "node:assert/strict";
import { itemAwaitingCondition, recordItem, resetSessions, setCondition, startTurn } from "../src/sessions.mjs";
import { describeInboundLinqMessage, formatListingDraft } from "../src/linq.mjs";

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
  assert.equal(item.status, "listed_draft");
});

test("'like new' and 'used' map onto the known conditions", () => {
  identifiedChair();
  assert.equal(describeInboundLinqMessage(textEvent("like new"), { awaitingCondition: true }).condition, "new");
  assert.equal(describeInboundLinqMessage(textEvent("used"), { awaitingCondition: true }).condition, "good");
});

test("the listing draft names the item, condition and a labelled placeholder price", () => {
  identifiedChair();
  const item = setCondition("chat-1", "good");
  const draft = formatListingDraft(item);

  assert.match(draft, /blue plastic stacking chair/);
  assert.match(draft, /Condition: good/);
  assert.match(draft, /Price: \$25 \(placeholder/);
  assert.match(draft, /the real price comes from the pricing study/, "a placeholder must never look like a measured price");
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
