/**
 * Launches a real Terac pricing study for a listing.
 *
 * This is the product's central claim made literal: the price comes from asking
 * real people what they would pay, not from a model's guess. There is no
 * fallback here on purpose — if a study cannot run, the item stays unpriced and
 * says so.
 *
 * A study costs real money (about $4.50 per participant), so launching is an
 * explicit act, never a side effect of publishing.
 */

const TERAC_API_URL = process.env.TERAC_API_URL || "https://terac.com/api/external/v2";
const REQUEST_TIMEOUT_MS = 30_000;

/** Matches the panel size the demand-curve fit needs to be meaningful. */
export const DEFAULT_PARTICIPANTS = 5;

function getApiKey() {
  if (!process.env.TERAC_API_KEY) throw new Error("TERAC_API_KEY is not configured.");
  return process.env.TERAC_API_KEY;
}

function getProjectId() {
  if (!process.env.TERAC_PROJECT_ID) throw new Error("TERAC_PROJECT_ID is not configured.");
  return process.env.TERAC_PROJECT_ID;
}

async function teracRequest(path, { method = "GET", body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${TERAC_API_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${getApiKey()}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message ?? payload?.error ?? JSON.stringify(payload).slice(0, 200);
    throw new Error(`Terac ${method} ${path} failed with ${response.status}: ${detail}`);
  }
  return payload?.data ?? payload;
}

/**
 * The questions the panel answers.
 *
 * `q2_max_wtp` is the one the demand curve is built from, and its key and
 * wording both contain "pay" so `extractWillingnessToPay` finds it.
 */
export function buildScreeningQuestions(listing) {
  const describe = `${listing.name} — condition: ${listing.condition}, local pickup in ${listing.location?.city ?? "the seller's area"}.`;
  const photo = listing.photoUrl ? ` Photo: ${listing.photoUrl}` : "";

  return [
    {
      key: "q1_bought_used",
      text: "Have you bought anything second-hand in the last 12 months?",
      pick: "one",
      answers: [
        { text: "Yes", qualify_logic: "may" },
        { text: "No", qualify_logic: "may" }
      ]
    },
    {
      key: "q2_max_wtp",
      text: `${describe}${photo} What is the MOST you would pay for this item, in USD? Enter a number only.`,
      pick: "text"
    },
    {
      key: "q3_min_seen",
      text: "What is the LOWEST price in USD you have seen a similar item sell for?",
      pick: "text"
    },
    {
      key: "q4_missing_info",
      text: "What information is MISSING that would stop you buying this?",
      pick: "any",
      answers: [
        { text: "Exact dimensions", qualify_logic: "may" },
        { text: "Condition detail or flaws", qualify_logic: "may" },
        { text: "Better photos", qualify_logic: "may" },
        { text: "Brand or model", qualify_logic: "may" },
        { text: "Nothing, I have enough", qualify_logic: "may" }
      ]
    }
  ];
}

/** Creates the study as a draft. Drafts cost nothing until launched. */
export async function createStudy(listing, { participants = DEFAULT_PARTICIPANTS, fetchImpl = fetch } = {}) {
  const opportunity = await teracRequest("/opportunities", {
    method: "POST",
    fetchImpl,
    body: {
      title: `Resale pricing — ${listing.name}`.slice(0, 120),
      internal_title: `room2store ${listing.code}`,
      description:
        "Answer four short questions about what a used item is worth to you. " +
        "Your answers set the real asking price on a local resale marketplace.",
      project_id: getProjectId(),
      num_participants: participants,
      business_type: "b2c",
      unrestricted_audience: true,
      screening_questions: buildScreeningQuestions(listing),
      tasks: [
        {
          sequence: 1,
          task_type: "activity",
          review_type: "self_report",
          title: "Answer the resale pricing questions",
          description: `Look at the item described in the screening questions and answer honestly. ${listing.name}.`,
          duration_minutes: 3
        }
      ],
      device_types: ["desktop", "mobile_ios", "mobile_android"],
      // Terac enforces a five-day minimum. A real panel takes days, which is
      // why a listing goes live first and is repriced when the study lands.
      expected_days_to_complete: 5
    }
  });

  return {
    id: opportunity.id,
    status: opportunity.status,
    dashboardUrl: opportunity.dashboard_url ?? null,
    costCents: opportunity.pricing?.total_cost_cents ?? null
  };
}

/**
 * Launches a draft so real people start answering. This spends money, so it is
 * a separate call from createStudy rather than folded into it.
 */
export async function launchStudy(opportunityId, { fetchImpl = fetch } = {}) {
  const launched = await teracRequest(`/opportunities/${encodeURIComponent(opportunityId)}/launch`, {
    method: "POST",
    fetchImpl
  });
  return { id: opportunityId, status: launched?.status ?? "launched" };
}

export async function getStudy(opportunityId, { fetchImpl = fetch } = {}) {
  const opportunity = await teracRequest(`/opportunities/${encodeURIComponent(opportunityId)}`, { fetchImpl });
  return {
    id: opportunity.id,
    status: opportunity.status,
    participants: opportunity.num_participants,
    submissions: opportunity.submission_stats ?? null,
    dashboardUrl: opportunity.dashboard_url ?? null
  };
}
