import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_TIMEOUT_MS, recordItem, resetSessions, startTurn } from "../src/sessions.mjs";
import { describeInboundLinqMessage } from "../src/linq.mjs";

const NOW = 1_770_000_000_000;
const textEvent = (value) => ({
  event_type: "message.received",
  data: { chat: { id: "chat-1" }, parts: [{ type: "text", value }] }
});

test.beforeEach(() => resetSessions());

test("a first message starts a new session", () => {
  const session = startTurn("chat-1", NOW);
  assert.equal(session.isNewSession, true);
  assert.equal(session.hasHistory, false);
});

test("a message inside 30 minutes continues the same session", () => {
  startTurn("chat-1", NOW);
  const session = startTurn("chat-1", NOW + SESSION_TIMEOUT_MS - 1_000);
  assert.equal(session.isNewSession, false);
});

test("a message after 30 minutes of quiet starts a new session", () => {
  startTurn("chat-1", NOW);
  const session = startTurn("chat-1", NOW + SESSION_TIMEOUT_MS + 1);
  assert.equal(session.isNewSession, true);
});

test("the idle window measures the gap between messages, not the first contact", () => {
  startTurn("chat-1", NOW);
  startTurn("chat-1", NOW + 20 * 60 * 1000);
  const session = startTurn("chat-1", NOW + 40 * 60 * 1000);
  assert.equal(session.isNewSession, false, "two 20-minute gaps must not add up to a timeout");
});

test("items survive a session reset", () => {
  startTurn("chat-1", NOW);
  recordItem("chat-1", { name: "Sony WH-1000XM5", modelNumber: "WH-1000XM5", status: "identified" }, NOW);
  const session = startTurn("chat-1", NOW + SESSION_TIMEOUT_MS + 1);
  assert.equal(session.isNewSession, true);
  assert.equal(session.hasHistory, true);
  assert.equal(session.items[0].name, "Sony WH-1000XM5");
});

test("a first-time sender gets the welcome with no returning-seller option", () => {
  const result = describeInboundLinqMessage(textEvent("hi"), startTurn("chat-1", NOW));
  assert.match(result.reply, /Welcome to Room2Store/);
  assert.doesNotMatch(result.reply, /Reply 1/);
});

test("a returning sender with items is offered the old-items option", () => {
  startTurn("chat-1", NOW);
  recordItem("chat-1", { name: "IKEA FADO", status: "identified" }, NOW);
  const session = startTurn("chat-1", NOW + SESSION_TIMEOUT_MS + 1);

  const result = describeInboundLinqMessage(textEvent("hi"), session);
  assert.match(result.reply, /Welcome to Room2Store/);
  assert.match(result.reply, /Reply 1 to check on the items you sent before\./);
});

test("a returning sender with no items is not offered the option", () => {
  startTurn("chat-1", NOW);
  const session = startTurn("chat-1", NOW + SESSION_TIMEOUT_MS + 1);

  const result = describeInboundLinqMessage(textEvent("hi"), session);
  assert.doesNotMatch(result.reply, /Reply 1/);
});

test("mid-session chatter does not repeat the welcome", () => {
  startTurn("chat-1", NOW);
  const session = startTurn("chat-1", NOW + 60_000);

  const result = describeInboundLinqMessage(textEvent("hello again"), session);
  assert.doesNotMatch(result.reply, /Welcome to Room2Store/);
  assert.match(result.reply, /Send a photo of the item/);
});

test("replying 1 lists the items already sent", () => {
  startTurn("chat-1", NOW);
  recordItem("chat-1", { name: "Sony WH-1000XM5", modelNumber: "WH-1000XM5", naivePrice: { amount: 200 } }, NOW);
  recordItem("chat-1", { name: "IKEA FADO", modelNumber: "MODEL_UNKNOWN", naivePrice: { amount: null } }, NOW);
  const session = startTurn("chat-1", NOW + 60_000);

  const result = describeInboundLinqMessage(textEvent("1"), session);
  assert.match(result.reply, /1\. Sony WH-1000XM5 \(WH-1000XM5\) — \$200 provisional/);
  assert.match(result.reply, /2\. IKEA FADO — pricing in progress/);
  assert.doesNotMatch(result.reply, /MODEL_UNKNOWN/);
});

test("asking for items with none sent says so plainly", () => {
  const result = describeInboundLinqMessage(textEvent("old"), startTurn("chat-1", NOW));
  assert.match(result.reply, /You have not sent me any items yet/);
});

test("an opt-out still wins over every other branch", () => {
  startTurn("chat-1", NOW);
  recordItem("chat-1", { name: "IKEA FADO" }, NOW);
  const result = describeInboundLinqMessage(textEvent("STOP"), startTurn("chat-1", NOW + 60_000));
  assert.equal(result.optedOut, true);
  assert.equal(result.reply, undefined);
});
