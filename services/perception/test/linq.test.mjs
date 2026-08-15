import test from "node:test";
import assert from "node:assert/strict";
import { describeInboundLinqMessage } from "../src/linq.mjs";

test("replies to an inbound text with a formatted Room2Store welcome", () => {
  const result = describeInboundLinqMessage({
    event_type: "message.received",
    data: { chat: { id: "chat-1" }, parts: [{ type: "text", value: "Hi" }] }
  });
  assert.equal(result.chatId, "chat-1");
  assert.match(result.reply, /Welcome to Room2Store/);
  assert.match(result.reply, /\n\n/);
});

test("does not reply after an opt-out keyword", () => {
  const result = describeInboundLinqMessage({
    event_type: "message.received",
    data: { chat: { id: "chat-1" }, parts: [{ type: "text", value: "STOP" }] }
  });
  assert.equal(result.optedOut, true);
  assert.equal(result.reply, undefined);
});
