/**
 * Buyer-side negotiation.
 *
 * The floor price is the hard bottom: it comes from the pricing study, and no
 * offer below it is ever accepted, however the buyer asks. If no floor has been
 * measured yet the agent refuses to negotiate at all rather than inventing one
 * — a made-up floor is worse than no negotiation.
 */

export const PLATFORM_FEE_RATE = 0.1;

/** Splits a sale into the platform's cut and the seller's, in whole cents. */
export function splitPayment(amountDollars) {
  const amountCents = Math.round(Number(amountDollars) * 100);
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  return {
    amountCents,
    platformFeeCents,
    sellerPayoutCents: amountCents - platformFeeCents
  };
}

/**
 * Decides how to answer an offer.
 * @returns {{action: "accept"|"counter"|"refuse"|"cannot_negotiate", counterOffer?: number, reason?: string}}
 */
export function evaluateOffer({ offer, price, floorPrice, previousCounters = 0 }) {
  const amount = Number(offer);
  if (!Number.isFinite(amount) || amount <= 0) return { action: "refuse", reason: "not_a_price" };

  // No measured floor means no mandate to sell. Refuse rather than guess.
  if (floorPrice == null || price == null) return { action: "cannot_negotiate", reason: "no_price_evidence" };

  if (amount >= price) return { action: "accept" };

  if (amount < floorPrice) {
    return { action: "refuse", reason: "below_floor", counterOffer: floorPrice };
  }

  // Between the floor and the asking price: one counter, splitting the gap,
  // then take the offer rather than lose the sale over a few dollars.
  if (previousCounters === 0) {
    const midpoint = Math.ceil((amount + price) / 2);
    return { action: "counter", counterOffer: Math.min(price, midpoint) };
  }

  return { action: "accept" };
}

const OFFER_PATTERN = /\$?\s*(\d{1,6})(?:\.(\d{2}))?\b/;

/** Reads an offer out of a message like "would you take 40?" or "$40". */
export function parseOffer(text) {
  const match = OFFER_PATTERN.exec(String(text ?? ""));
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = match[2] ? Number(match[2]) / 100 : 0;
  return dollars + cents;
}

/** Listing codes are typed by hand, so accept them in any case and spacing. */
export function parseListingCode(text) {
  const match = /\bR2S[\s-]?([A-Z0-9]{4})\b/i.exec(String(text ?? ""));
  return match ? `R2S-${match[1].toUpperCase()}` : null;
}
