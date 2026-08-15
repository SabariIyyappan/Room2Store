import assert from "node:assert/strict";
import test from "node:test";
import { detectPii, scrubText } from "../src/pii.ts";

test("B7 detects an email address", () => {
  const findings = detectPii("Reach me at seller@example.com for pickup.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.type, "email");
  assert.equal(findings[0]?.value, "seller@example.com");
});

test("B7 detects a phone number", () => {
  const findings = detectPii("Call or text 415-555-0134 anytime.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.type, "phone");
});

test("B7 detects an SSN", () => {
  const findings = detectPii("SSN on file: 123-45-6789");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.type, "ssn");
});

test("B7 detects a grouped credit card number", () => {
  const findings = detectPii("Card ending in 4111-1111-1111-1111 was used.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.type, "credit_card");
});

test("B7 detects a street address", () => {
  const findings = detectPii("Pickup at 742 Evergreen Terrace, ring the bell.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.type, "street_address");
});

test("B7 finds nothing in ordinary listing copy", () => {
  assert.deepEqual(detectPii("Comfortable office chair, gently used, adjustable height."), []);
});

test("B7 does not double-count overlapping matches, keeps the longer span", () => {
  const findings = detectPii("SSN 123-45-6789 belongs to no one, this is a fixture.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.type, "ssn");
});

test("B7 scrubText redacts every finding and preserves surrounding text", () => {
  const { scrubbed, findings } = scrubText("Email seller@example.com or call 415-555-0134.");
  assert.equal(findings.length, 2);
  assert.equal(scrubbed, "Email [REDACTED:EMAIL] or call [REDACTED:PHONE].");
});

test("B7 scrubText is a no-op when there's nothing to redact", () => {
  const clean = "Sturdy desk lamp, works great.";
  assert.deepEqual(scrubText(clean), { scrubbed: clean, findings: [] });
});
