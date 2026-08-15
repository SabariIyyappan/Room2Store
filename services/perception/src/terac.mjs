/**
 * Terac panel client and demand-curve fitting.
 *
 * This is the part of the product that makes its central claim true: the price
 * is measured on real people rather than guessed by a model. Everything here
 * derives from panel answers, and when there are too few answers to be
 * meaningful it refuses to produce a price at all.
 */

const TERAC_API_URL = process.env.TERAC_API_URL || "https://terac.com/api/external/v2";
const REQUEST_TIMEOUT_MS = 20_000;

/** Below this, a "measured" price would be theatre. */
export const MIN_SAMPLE_SIZE = 5;
/** The purchase probability the floor price is set at. */
export const FLOOR_PROBABILITY = 0.75;

export function isTeracConfigured() {
  return Boolean(process.env.TERAC_API_KEY);
}

function getApiKey() {
  if (!process.env.TERAC_API_KEY) throw new Error("TERAC_API_KEY is not configured.");
  return process.env.TERAC_API_KEY;
}

/**
 * Verifies a Terac webhook.
 *
 * The signature is base64(HMAC-SHA256(secret, timestamp + rawBody)) with no
 * separator, over the *raw* body — parsing and re-serialising changes the bytes
 * and the signature will not match.
 *
 * The docs name the signature header but not the timestamp header, so any
 * plausible timestamp header is accepted and the one actually present is used.
 */
export async function isVerifiedTeracWebhook(headers, rawBody, secret, { toleranceSeconds = 300 } = {}) {
  if (!secret) return false;

  const signature = headers["x-terac-request-signature"];
  const timestamp =
    headers["x-terac-request-timestamp"] ??
    headers["x-terac-timestamp"] ??
    headers["x-request-timestamp"] ??
    headers["x-terac-request-time"];
  if (!signature || !timestamp) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp) / (String(timestamp).length > 11 ? 1000 : 1));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(`${timestamp}${rawBody}`).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected, "base64"), Buffer.from(String(signature), "base64"));
  } catch {
    return false;
  }
}

async function teracGet(path, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${TERAC_API_URL}${path}`, {
    headers: { authorization: `Bearer ${getApiKey()}`, accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(`Terac ${path} failed with status ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  return response.json();
}

/** Every approved submission for an opportunity, following pagination. */
export async function fetchApprovedSubmissions(opportunityId, { fetchImpl = fetch } = {}) {
  const submissions = [];
  let cursor = null;

  do {
    const query = new URLSearchParams({ status: "approved", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await teracGet(`/opportunities/${encodeURIComponent(opportunityId)}/submissions?${query}`, { fetchImpl });
    submissions.push(...(page.data ?? []));
    cursor = page.pagination?.has_more ? page.pagination.next_cursor : null;
  } while (cursor);

  return submissions;
}

const MONEY = /\$?\s*(\d{1,6}(?:\.\d{1,2})?)/;

/**
 * Pulls the willingness-to-pay figure out of a submission's answers.
 *
 * Question keys vary between studies, so any key or question text mentioning
 * price, pay or worth is treated as the WTP answer.
 */
export function extractWillingnessToPay(submission) {
  for (const answer of submission?.screening_answers ?? []) {
    const asks = `${answer.key ?? ""} ${answer.question ?? ""}`.toLowerCase();
    if (!/price|pay|worth|value|spend/.test(asks)) continue;

    const values = Array.isArray(answer.answer) ? answer.answer : [answer.answer];
    for (const value of values) {
      const match = MONEY.exec(String(value ?? ""));
      if (match) {
        const amount = Number(match[1]);
        if (Number.isFinite(amount) && amount > 0) return amount;
      }
    }
  }
  return null;
}

/**
 * Fits a demand curve to the panel's willingness-to-pay values.
 *
 * At each candidate price the purchase probability is the share of respondents
 * willing to pay at least that much; expected revenue is price × probability.
 * The recommended price maximises expected revenue, and the floor is the
 * highest price at which three respondents in four would still buy.
 */
export function fitDemandCurve(willingnessToPay) {
  const values = willingnessToPay.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (values.length < MIN_SAMPLE_SIZE) {
    return { ok: false, reason: "insufficient_sample", sampleSize: values.length };
  }

  const probabilityAt = (price) => values.filter((value) => value >= price).length / values.length;

  const pricePoints = [...new Set(values)].map((price) => {
    const probability = probabilityAt(price);
    return { price, probability, expectedRevenue: Math.round(price * probability * 100) / 100 };
  });

  const best = pricePoints.reduce((winner, point) => (point.expectedRevenue > winner.expectedRevenue ? point : winner));

  // The highest price at least FLOOR_PROBABILITY of the panel would still pay.
  const affordable = pricePoints.filter((point) => point.probability >= FLOOR_PROBABILITY);
  const floor = affordable.length > 0 ? Math.max(...affordable.map((point) => point.price)) : values[0];

  return {
    ok: true,
    sampleSize: values.length,
    recommendedPrice: Math.round(best.price),
    floorPrice: Math.round(Math.min(floor, best.price)),
    expectedRevenue: best.expectedRevenue,
    medianWillingnessToPay: values[Math.floor(values.length / 2)],
    pricePoints
  };
}

/** Fetches a study's approved answers and turns them into a price. */
export async function priceFromStudy(opportunityId, { fetchImpl = fetch } = {}) {
  const submissions = await fetchApprovedSubmissions(opportunityId, { fetchImpl });
  const willingnessToPay = submissions.map(extractWillingnessToPay).filter((value) => value != null);
  return { ...fitDemandCurve(willingnessToPay), opportunityId, submissionCount: submissions.length };
}
