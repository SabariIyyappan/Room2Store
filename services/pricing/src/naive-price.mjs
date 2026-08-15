const CONDITION_MULTIPLIERS = {
  new: 0.72,
  excellent: 0.62,
  good: 0.5,
  fair: 0.35,
  unknown: 0.45
};

/**
 * A deliberately simple "before" price. The Terac demand curve will replace it.
 */
export function createNaivePrice(candidate, condition = "unknown") {
  const multiplier = CONDITION_MULTIPLIERS[condition] ?? CONDITION_MULTIPLIERS.unknown;
  if (candidate.referencePrice == null || !Number.isFinite(Number(candidate.referencePrice))) {
    return {
      amount: null,
      currency: "USD",
      method: "comps lookup pending",
      referencePrice: null,
      condition,
      status: "needs_comps"
    };
  }

  const amount = Math.max(5, Math.round(candidate.referencePrice * multiplier / 5) * 5);

  return {
    amount,
    currency: "USD",
    method: "reference retail price × condition multiplier",
    referencePrice: candidate.referencePrice,
    condition,
    status: "provisional"
  };
}
