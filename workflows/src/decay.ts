import type { Item, PriceEvidence } from "@room2store/contracts";

/**
 * B11: the pure price-decay math — no Band/API/IO — so it's unit-testable
 * without the room/gate scaffolding the other stages need. Two paths:
 *
 * 1. Learned elasticity: `PriceEvidence.pricePoints` from Terac Study A is
 *    real measured (price, purchaseProbability) pairs. If any studied price
 *    below the item's current price has a higher purchase probability, that
 *    is the demand curve's own answer to "what would sell" — walk down to
 *    the studied point with the best expected revenue among prices strictly
 *    below the current one, per plan.md 1.2's "expected revenue = price ×
 *    probability" formula A already uses to pick the initial price.
 * 2. No usable evidence (e.g. the `syntheticEvidence` single-point fallback
 *    in `stage-integrations.ts`, or an item that was never studied): fall
 *    back to a flat 10% cut, same order of magnitude as A9/A10's listing
 *    lift deltas.
 *
 * Both paths are clamped at the item's floor price — decay drops price to
 * move a stale item, it never undercuts the floor `priceStage` already
 * negotiated, since that floor is also what `closeSale`'s gate and C6's
 * negotiator both rely on as the hard bottom.
 */
export const DECAY_UNSOLD_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const FLAT_DECAY_RATIO = 0.9;

export interface DecayDecision {
  shouldDecay: boolean;
  newPrice: number;
  reason: string;
}

function bestElasticityStep(currentPrice: number, floor: number, pricePoints: PriceEvidence["pricePoints"]): number | undefined {
  const candidates = pricePoints.filter((point) => point.price < currentPrice && point.price >= floor);
  if (candidates.length === 0) return undefined;

  const best = candidates.reduce((a, b) => (b.expectedRevenue > a.expectedRevenue ? b : a));
  return best.price < currentPrice ? best.price : undefined;
}

/**
 * Decides whether an item should decay given how long it's been at its
 * current price. `msSinceLastPriceSet` is measured from the room's own
 * "price set" Band history (see `decayStage`), not a DB timestamp — same
 * "Band history is the source of truth for gate-relevant timing" precedent
 * `gate-engine.ts`'s `startResearch` already established for reshoots.
 */
export function decideDecay(item: Item, msSinceLastPriceSet: number, evidence: PriceEvidence | undefined): DecayDecision {
  const currentPrice = item.measuredPrice;
  const floor = item.floorPrice;

  if (currentPrice === undefined || floor === undefined) {
    return { shouldDecay: false, newPrice: currentPrice ?? 0, reason: "no measured price/floor to decay from" };
  }
  if (msSinceLastPriceSet < DECAY_UNSOLD_THRESHOLD_MS) {
    return { shouldDecay: false, newPrice: currentPrice, reason: "under the 24h unsold threshold" };
  }
  if (currentPrice <= floor) {
    return { shouldDecay: false, newPrice: currentPrice, reason: "already at floor price" };
  }

  const elasticityPrice = evidence && evidence.pricePoints.length > 0 ? bestElasticityStep(currentPrice, floor, evidence.pricePoints) : undefined;
  if (elasticityPrice !== undefined) {
    return { shouldDecay: true, newPrice: elasticityPrice, reason: `learned elasticity: studied price point $${elasticityPrice} has higher expected revenue than $${currentPrice}` };
  }

  const flatPrice = Math.max(floor, Math.round(currentPrice * FLAT_DECAY_RATIO));
  return { shouldDecay: flatPrice < currentPrice, newPrice: flatPrice, reason: `no usable price-point evidence: flat ${Math.round((1 - FLAT_DECAY_RATIO) * 100)}% cut` };
}
