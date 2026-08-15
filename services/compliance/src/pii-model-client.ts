import { scrubText, type PiiEntityType, type PiiMatch } from "./pii.ts";

export interface PiiScrubOutcome {
  scrubbed: string;
  findings: PiiMatch[];
}

export interface PiiModelClient {
  scrub(text: string): Promise<PiiScrubOutcome>;
}

/**
 * Local, dependency-free PII scrubber — deterministic and network-free, so
 * it's what tests run against and what the demo falls back to if the live
 * model is unreachable (plan.md §6: the fixture-mode toggle doubles as the
 * demo's network-dies fallback). PioneerPiiClient below is the real
 * Pioneer entry this stands in for.
 */
export class LocalPiiModelClient implements PiiModelClient {
  async scrub(text: string): Promise<PiiScrubOutcome> {
    return scrubText(text);
  }
}

/**
 * Our five PiiEntityTypes mapped onto Pioneer's GLiNER2-PII schema, which
 * spans 42 entity types across seven groups (docs.pioneer.ai/concepts/
 * g-li-ner-2-pii) — we only ask for the ones with a clean match. Pioneer
 * has no dedicated "ssn" type; national_id_number is the closest fit for a
 * US social security number.
 */
const pioneerEntityTypeFor: Record<PiiEntityType, string> = {
  email: "email",
  phone: "phone_number",
  street_address: "street_address",
  ssn: "national_id_number",
  credit_card: "card_number",
};

const pioneerEntityTypeFrom: Record<string, PiiEntityType> = Object.fromEntries(
  Object.entries(pioneerEntityTypeFor).map(([ours, theirs]) => [theirs, ours as PiiEntityType]),
);

function redact(text: string, matches: PiiMatch[]): string {
  if (matches.length === 0) return text;
  const ordered = [...matches].sort((a, b) => a.start - b.start);
  let scrubbed = "";
  let cursor = 0;
  for (const match of ordered) {
    scrubbed += text.slice(cursor, match.start) + `[REDACTED:${match.type.toUpperCase()}]`;
    cursor = match.end;
  }
  return scrubbed + text.slice(cursor);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

interface PioneerEntitySpan {
  type?: string;
  text?: string;
  start?: number;
  end?: number;
}

/**
 * B7 — Pioneer track: calls Pioneer AI's hosted GLiNER2-PII model
 * (`fastino/gliner2-privacy-filter-PII-multi`) over Pioneer's
 * OpenAI-compatible `/v1/chat/completions` endpoint to detect PII spans in
 * outbound copy and buyer message logs. Configured via `PIONEER_API_KEY`
 * (see .env.example); `PIONEER_API_URL` defaults to Pioneer's public API.
 *
 * Note: plan.md pairs "GLiGuard/GLiNER2-PII" as one Pioneer entry, but
 * they're different Fastino models — GLiGuard is a prompt/response safety
 * *guardrail* classifier (jailbreak, toxicity, refusal detection), not a
 * PII tool, and Pioneer's docs don't show a hosted endpoint for it (only
 * local inference). GLiNER2-PII is the one that actually does PII
 * detection, so that's what this client calls; GLiGuard isn't used here.
 *
 * Pioneer's docs confirm the request shape (model, messages, schema with
 * an `entities` list, optional include_spans/include_confidence) but don't
 * publish the response body beyond "OpenAI-compatible", so this reads
 * entity spans out of `choices[0].message.content` (parsed as JSON with an
 * `entities` array) and redacts the text itself from those spans, rather
 * than trusting an unpublished top-level field. Any shape this doesn't
 * recognize — network failure, non-2xx, unparseable content, or entities
 * present but none matching our five known types — degrades to the local
 * scrubber so a surprising response never ships text unredacted.
 */
export class PioneerPiiClient implements PiiModelClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async scrub(text: string): Promise<PiiScrubOutcome> {
    if (text.length === 0) return { scrubbed: text, findings: [] };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "fastino/gliner2-privacy-filter-PII-multi",
          messages: [{ role: "user", content: text }],
          schema: { entities: Object.values(pioneerEntityTypeFor) },
          include_spans: true,
          include_confidence: true,
        }),
      });
    } catch {
      return scrubText(text);
    }
    if (!response.ok) return scrubText(text);

    const payload = (await response.json().catch(() => undefined)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | undefined;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return scrubText(text);

    const parsed = safeParseJson(content) as { entities?: PioneerEntitySpan[] } | undefined;
    const spans = parsed?.entities;
    if (!Array.isArray(spans)) return scrubText(text);

    const findings: PiiMatch[] = spans
      .filter(
        (span): span is Required<PioneerEntitySpan> =>
          typeof span.type === "string" &&
          span.type in pioneerEntityTypeFrom &&
          typeof span.text === "string" &&
          typeof span.start === "number" &&
          typeof span.end === "number",
      )
      .map((span) => ({ type: pioneerEntityTypeFrom[span.type]!, value: span.text, start: span.start, end: span.end }));

    // Pioneer reported entities we couldn't map — don't ship a half-redacted string.
    if (findings.length === 0 && spans.length > 0) return scrubText(text);

    return { scrubbed: redact(text, findings), findings };
  }
}

/** Picks the live Pioneer GLiNER2-PII model when an API key is configured, else the local fallback. */
export function createPiiModelClient(
  baseUrl = process.env.PIONEER_API_URL ?? "https://api.pioneer.ai/v1",
  apiKey = process.env.PIONEER_API_KEY,
): PiiModelClient {
  if (apiKey) return new PioneerPiiClient(baseUrl, apiKey);
  return new LocalPiiModelClient();
}
