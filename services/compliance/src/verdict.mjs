/**
 * Compliance verdict for a confirmed item plus its listing copy.
 *
 * A veto is load-bearing: the store builder must refuse to deploy an item whose
 * decision is not "approve".
 */

const PROHIBITED = [
  { rule: "prohibited_weapon", match: /\b(gun|firearm|rifle|pistol|ammunition|taser|knife set|switchblade)\b/i },
  { rule: "prohibited_car_seat", match: /\b(car seat|booster seat|infant seat)\b/i },
  { rule: "prohibited_medication", match: /\b(medication|prescription|pill|supplement|vitamins)\b/i },
  { rule: "prohibited_recalled", match: /\brecalled\b/i }
];

const UNVERIFIABLE_CLAIMS = [
  { rule: "claim_brand_new", match: /\bbrand new\b/i },
  { rule: "claim_warranty", match: /\b(warranty|guaranteed authentic|lifetime guarantee)\b/i },
  { rule: "claim_never_used", match: /\bnever used\b/i }
];

const STREET_ADDRESS = /\b\d{1,5}\s+[A-Za-z][A-Za-z.\s]{2,30}\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct)\b/i;

function haystack(item, listingCopy) {
  return [item?.name, item?.category, item?.attributes?.brand, item?.attributes?.model, listingCopy]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {object} input
 * @param {object} input.item confirmed item from confirmIdentification
 * @param {string} [input.listingCopy] buyer-facing copy
 * @param {string[]} [input.exclusions] seller's "sell everything except ___" list
 * @param {boolean} [input.contactOptedIn] whether the target contact opted in
 */
export function reviewItem({ item, listingCopy = "", exclusions = [], contactOptedIn = true }) {
  const text = haystack(item, listingCopy);
  const triggered = [];

  for (const entry of [...PROHIBITED, ...UNVERIFIABLE_CLAIMS]) {
    if (entry.match.test(text)) triggered.push(entry.rule);
  }

  for (const exclusion of exclusions) {
    const term = String(exclusion).trim();
    if (term && new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
      triggered.push(`excluded_object:${term}`);
    }
  }

  if (STREET_ADDRESS.test(listingCopy)) triggered.push("unsafe_pickup_address");
  if (!contactOptedIn) triggered.push("contact_not_opted_in");

  const vetoes = triggered.filter((rule) => !rule.startsWith("claim_"));
  const decision = vetoes.length > 0 ? "veto" : triggered.length > 0 ? "revise" : "approve";

  return {
    item: item?.id ?? null,
    decision,
    rulesTriggered: triggered,
    reason: describe(decision, triggered)
  };
}

function describe(decision, triggered) {
  if (decision === "approve") return "No prohibited category, unverifiable claim, excluded object, or unsafe detail was found.";
  if (decision === "veto") return `Listing is blocked: ${triggered.join(", ")}.`;
  return `Listing needs a copy rewrite before deploy: ${triggered.join(", ")}.`;
}

/** The deploy gate. Anything that is not an approve stops the store builder. */
export function canDeploy(verdict) {
  return verdict?.decision === "approve";
}
