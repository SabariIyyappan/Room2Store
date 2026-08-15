import assert from "node:assert/strict";
import test from "node:test";
import type { Contact } from "@room2store/contracts";
import { canMessageContact } from "../src/contact-rules.ts";

const base: Contact = { id: "contact_001", handle: "+15555550100", optedIn: false, engagementEvents: [] };

test("B6 refuses to message an opted-out contact", () => {
  const result = canMessageContact(base);
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? "", /opted in/);
});

test("B6 allows messaging an opted-in contact", () => {
  const result = canMessageContact({ ...base, optedIn: true, optedInAt: "2026-08-15T09:00:00.000Z" });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, undefined);
});
