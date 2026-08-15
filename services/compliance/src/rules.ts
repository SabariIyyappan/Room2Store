import type { Campaign, Item, Listing } from "@room2store/contracts";
import { detectPii } from "./pii.ts";

export interface RuleFinding {
  rule: string;
  message: string;
}

// --- prohibited categories -------------------------------------------------

const prohibitedCategories = new Set([
  "weapons",
  "weapon",
  "firearms",
  "firearm",
  "ammunition",
  "recalled goods",
  "recalled",
  "car seats",
  "car seat",
  "medication",
  "medications",
  "prescription",
  "prescription drugs",
]);

/** The car-seat veto from plan.md's live demo is this rule firing. */
export function checkProhibitedCategory(item: Item): RuleFinding | undefined {
  const category = item.category.trim().toLowerCase();
  if (!prohibitedCategories.has(category)) return undefined;
  return {
    rule: "prohibited_category",
    message: `"${item.category}" is a prohibited category and cannot be listed.`,
  };
}

// --- unverifiable claims ----------------------------------------------------

const unverifiableClaimPatterns = [/\bbrand[ -]new\b/i, /\bwarrant(?:y|ied)\b/i, /\blifetime\s+guarantee\b/i];

function listingCopy(item: Item): string {
  const listings: Listing[] = [item.listingV1, item.listingV2].filter((listing): listing is Listing => Boolean(listing));
  return listings.flatMap((listing) => [listing.title, listing.description, listing.publicCopy]).join(" \n ");
}

/** A used item can't honestly claim to be brand new or under warranty — flag it for a copy edit. */
export function checkUnverifiableClaims(item: Item): RuleFinding | undefined {
  const copy = listingCopy(item);
  const pattern = unverifiableClaimPatterns.find((candidate) => candidate.test(copy));
  if (!pattern) return undefined;
  const match = copy.match(pattern)?.[0] ?? "unverifiable claim";
  return {
    rule: "unverifiable_claim",
    message: `Listing copy makes an unverifiable claim ("${match}") that can't be confirmed for a used item.`,
  };
}

// --- accidental listing of an excluded object -------------------------------

/** The seller said "sell everything except ___" — catch it if catalog puts one of those objects up anyway. */
export function checkExcludedObject(item: Item, campaign: Campaign): RuleFinding | undefined {
  const haystack = `${item.name} ${item.category}`.toLowerCase();
  const excluded = campaign.exclusionList.find((entry) => haystack.includes(entry.trim().toLowerCase()));
  if (!excluded) return undefined;
  return {
    rule: "excluded_object",
    message: `"${item.name}" matches the seller's exclusion "${excluded}" and must not be listed.`,
  };
}

// --- unsafe pickup detail ----------------------------------------------------

/** An exact street address in public copy is a safety issue, not a pricing one. */
export function checkUnsafePickupDetail(item: Item): RuleFinding | undefined {
  const copy = listingCopy(item);
  const hasAddress = detectPii(copy).some((match) => match.type === "street_address");
  if (!hasAddress) return undefined;
  return {
    rule: "unsafe_pickup_detail",
    message: "Public listing copy appears to contain an exact street address; use a neighborhood or cross-street instead.",
  };
}

// --- public PII (B7) ---------------------------------------------------------

/**
 * B7: an email, phone number, SSN, or card number pasted into public copy.
 * Unlike an unsafe pickup address this is auto-fixable — scrub-outbound.ts
 * can redact it — so it downgrades the item to "revise" rather than a veto.
 */
export function checkPublicPii(item: Item): RuleFinding | undefined {
  const copy = listingCopy(item);
  const findings = detectPii(copy).filter((match) => match.type !== "street_address");
  if (findings.length === 0) return undefined;
  const types = [...new Set(findings.map((match) => match.type))].join(", ");
  return {
    rule: "public_pii",
    message: `Listing copy exposes PII (${types}) that must be scrubbed before it goes public.`,
  };
}

/** Rules whose finding is severe enough to veto the item outright. */
export const vetoRules = new Set(["prohibited_category", "excluded_object", "unsafe_pickup_detail"]);

/** Rules that ask for a copy fix rather than a hard block. */
export const reviseRules = new Set(["unverifiable_claim", "public_pii"]);

export function runItemRules(item: Item, campaign: Campaign): RuleFinding[] {
  return [
    checkProhibitedCategory(item),
    checkExcludedObject(item, campaign),
    checkUnsafePickupDetail(item),
    checkUnverifiableClaims(item),
    checkPublicPii(item),
  ].filter((finding): finding is RuleFinding => Boolean(finding));
}
