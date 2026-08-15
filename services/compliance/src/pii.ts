/**
 * B7 — the deterministic PII detector underneath the compliance scrub
 * pipeline. Regex-based on purpose: it needs to run synchronously inside
 * rules.ts (same as every other B6 rule) and to work with no network, so
 * it is also the demo's fixture fallback if the live GLiGuard/GLiNER2-PII
 * model (pii-model-client.ts) is unreachable — see plan.md §6's
 * fixture-mode toggle.
 */

export type PiiEntityType = "email" | "phone" | "street_address" | "ssn" | "credit_card";

export interface PiiMatch {
  type: PiiEntityType;
  value: string;
  start: number;
  end: number;
}

interface PiiPatternSpec {
  type: PiiEntityType;
  pattern: RegExp;
}

/** Reused by rules.ts's checkUnsafePickupDetail — one address pattern, not two. */
export const streetAddressPattern =
  /\b\d{1,5}\s+(?:[A-Za-z0-9.'-]+\s){1,4}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl|terrace|terr|circle|cir|parkway|pkwy|square|sq|highway|hwy|trail|trl)\b/gi;

const patterns: PiiPatternSpec[] = [
  { type: "email", pattern: /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/g },
  { type: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "credit_card", pattern: /\b(?:\d{4}[ -]){3}\d{4}\b/g },
  { type: "phone", pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { type: "street_address", pattern: streetAddressPattern },
];

/** Finds every PII span in text, longest match wins on overlap, in reading order. */
export function detectPii(text: string): PiiMatch[] {
  const raw: PiiMatch[] = [];
  for (const { type, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      raw.push({ type, value: match[0], start: match.index, end: match.index + match[0].length });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const resolved: PiiMatch[] = [];
  let cursor = 0;
  for (const match of raw) {
    if (match.start < cursor) continue; // overlaps a match already kept
    resolved.push(match);
    cursor = match.end;
  }
  return resolved;
}

const redactionLabels: Record<PiiEntityType, string> = {
  email: "EMAIL",
  phone: "PHONE",
  street_address: "ADDRESS",
  ssn: "SSN",
  credit_card: "CARD",
};

export interface ScrubResult {
  scrubbed: string;
  findings: PiiMatch[];
}

/** Replaces every detected PII span with a `[REDACTED:TYPE]` marker. */
export function scrubText(text: string): ScrubResult {
  const findings = detectPii(text);
  if (findings.length === 0) return { scrubbed: text, findings };

  let scrubbed = "";
  let cursor = 0;
  for (const match of findings) {
    scrubbed += text.slice(cursor, match.start);
    scrubbed += `[REDACTED:${redactionLabels[match.type]}]`;
    cursor = match.end;
  }
  scrubbed += text.slice(cursor);
  return { scrubbed, findings };
}
