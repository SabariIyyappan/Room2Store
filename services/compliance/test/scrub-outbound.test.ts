import assert from "node:assert/strict";
import test from "node:test";
import type { Listing } from "@room2store/contracts";
import { LocalPiiModelClient } from "../src/pii-model-client.ts";
import { scrubBuyerMessageLog, scrubListing, type BuyerMessageLogEntry } from "../src/scrub-outbound.ts";

const client = new LocalPiiModelClient();

test("B7 scrubListing redacts PII across title, description, and publicCopy", async () => {
  const listing: Listing = {
    title: "Office chair",
    description: "Good condition, email seller@example.com with questions.",
    photoUrls: [],
    publicCopy: "Pickup at 742 Evergreen Terrace, call 415-555-0134.",
  };

  const result = await scrubListing(client, listing);

  assert.equal(result.listing.title, "Office chair");
  assert.match(result.listing.description, /\[REDACTED:EMAIL]/);
  assert.match(result.listing.publicCopy, /\[REDACTED:ADDRESS]/);
  assert.match(result.listing.publicCopy, /\[REDACTED:PHONE]/);
  assert.equal(result.findings.length, 2);
  assert.deepEqual(
    result.findings.map((finding) => finding.field).sort(),
    ["description", "publicCopy"],
  );
});

test("B7 scrubListing is a pass-through for clean copy", async () => {
  const listing: Listing = {
    title: "Desk lamp",
    description: "Works great, minor scuff on the base.",
    photoUrls: [],
    publicCopy: "Pickup near Mission and 24th, San Francisco.",
  };

  const result = await scrubListing(client, listing);
  assert.deepEqual(result.listing, listing);
  assert.deepEqual(result.findings, []);
});

test("B7 scrubBuyerMessageLog redacts PII a buyer pastes mid-thread", async () => {
  const entries: BuyerMessageLogEntry[] = [
    { id: "msg_1", buyerHandle: "+15555550100", body: "Interested! Can I pick up tomorrow?", occurredAt: "2026-08-15T10:00:00.000Z" },
    { id: "msg_2", buyerHandle: "+15555550100", body: "Sure, my email is buyer@example.com.", occurredAt: "2026-08-15T10:05:00.000Z" },
  ];

  const scrubbed = await scrubBuyerMessageLog(client, entries);

  assert.equal(scrubbed[0]?.body, entries[0]?.body);
  assert.deepEqual(scrubbed[0]?.piiFindings, []);
  assert.match(scrubbed[1]?.body ?? "", /\[REDACTED:EMAIL]/);
  assert.equal(scrubbed[1]?.piiFindings[0]?.type, "email");
});
