import type { Listing } from "@room2store/contracts";
import type { PiiMatch } from "./pii.ts";
import type { PiiModelClient } from "./pii-model-client.ts";

const listingTextFields = ["title", "description", "publicCopy"] as const;
type ListingTextField = (typeof listingTextFields)[number];

export interface ScrubbedListingField {
  field: ListingTextField;
  findings: PiiMatch[];
}

export interface ScrubListingResult {
  listing: Listing;
  findings: ScrubbedListingField[];
}

/**
 * B7: runs every outbound-facing listing field through the PII model and
 * returns a listing safe to publish. This is the "outbound copy" half of
 * B7's brief; scrubBuyerMessageLog below is the "buyer message logs" half.
 */
export async function scrubListing(client: PiiModelClient, listing: Listing): Promise<ScrubListingResult> {
  const scrubbedListing: Listing = { ...listing };
  const findings: ScrubbedListingField[] = [];

  for (const field of listingTextFields) {
    const outcome = await client.scrub(listing[field]);
    scrubbedListing[field] = outcome.scrubbed;
    if (outcome.findings.length > 0) findings.push({ field, findings: outcome.findings });
  }

  return { listing: scrubbedListing, findings };
}

/**
 * A single buyer<->seller message as C's messaging layer (Linq) would log
 * it. This shape lives here rather than in @room2store/contracts because
 * the contracts package is frozen (plan.md §1.3) and no message-log entity
 * has been agreed on yet — C's layer can pass its own log rows in this
 * shape without a contracts change.
 */
export interface BuyerMessageLogEntry {
  id: string;
  buyerHandle: string;
  body: string;
  occurredAt: string;
}

export interface ScrubbedMessageLogEntry extends BuyerMessageLogEntry {
  piiFindings: PiiMatch[];
}

/**
 * B7: scrubs a buyer message transcript before it's persisted or shown on
 * the judge dashboard, so a buyer pasting their own address or card number
 * mid-negotiation never ends up in a durable log verbatim.
 */
export async function scrubBuyerMessageLog(
  client: PiiModelClient,
  entries: BuyerMessageLogEntry[],
): Promise<ScrubbedMessageLogEntry[]> {
  const results: ScrubbedMessageLogEntry[] = [];
  for (const entry of entries) {
    const outcome = await client.scrub(entry.body);
    results.push({ ...entry, body: outcome.scrubbed, piiFindings: outcome.findings });
  }
  return results;
}
