/**
 * Platform earnings ledger.
 *
 * Every settled sale records what the platform kept and what the seller is
 * owed. Sellers are NOT paid automatically — this is a single-account Stripe
 * setup, so the payout figure is a record of a debt, not evidence it was sent.
 */

const sales = [];

export function recordSale({ orderId, listingName, amountCents, platformFeeCents, sellerPayoutCents }) {
  sales.push({
    orderId,
    listingName,
    amountCents,
    platformFeeCents,
    sellerPayoutCents,
    settledAt: new Date().toISOString()
  });
  return totals();
}

export function totals() {
  const sum = (key) => sales.reduce((total, sale) => total + sale[key], 0);
  return {
    sales: sales.length,
    grossCents: sum("amountCents"),
    platformEarningsCents: sum("platformFeeCents"),
    sellerPayoutsOwedCents: sum("sellerPayoutCents"),
    recent: sales.slice(-10).reverse()
  };
}

export function resetEarnings() {
  sales.length = 0;
}
