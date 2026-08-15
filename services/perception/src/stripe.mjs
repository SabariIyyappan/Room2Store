/**
 * Stripe Checkout.
 *
 * Single-account model: the platform collects the full amount, and the 10% fee
 * and 90% seller payout are recorded on the order as a ledger, settled out of
 * band. This is NOT Stripe Connect — sellers are not paid automatically, and
 * nothing here should claim they are.
 *
 * Called with the REST API rather than the SDK to keep the service dependency
 * free; Checkout Sessions are one form-encoded POST.
 */

const STRIPE_API_URL = process.env.STRIPE_API_URL || "https://api.stripe.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function getSecretKey() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return process.env.STRIPE_SECRET_KEY;
}

/**
 * Creates a Checkout Session and returns its hosted payment URL.
 * The order id travels in client_reference_id so the webhook can find it again.
 */
export async function createCheckoutSession({ order, listing, successUrl, cancelUrl }, { fetchImpl = fetch } = {}) {
  const body = new URLSearchParams({
    mode: "payment",
    client_reference_id: order.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(order.amountCents),
    "line_items[0][price_data][product_data][name]": listing.name,
    "line_items[0][price_data][product_data][description]": `Condition: ${listing.condition} · Pickup: ${listing.location.city}, ${listing.location.state}`,
    "metadata[order_id]": order.id,
    "metadata[listing_id]": listing.id,
    "metadata[listing_code]": listing.code,
    "metadata[platform_fee_cents]": String(order.platformFeeCents),
    "metadata[seller_payout_cents]": String(order.sellerPayoutCents),
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  if (listing.photoUrl) body.set("line_items[0][price_data][product_data][images][0]", listing.photoUrl);

  const response = await fetchImpl(`${STRIPE_API_URL}/checkout/sessions`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${getSecretKey()}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Stripe checkout failed with status ${response.status}: ${payload?.error?.message ?? "unknown error"}`);
  }
  return { id: payload.id, url: payload.url };
}

/**
 * Verifies a Stripe webhook signature.
 *
 * Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends it in a
 * Stripe-Signature header as `t=...,v1=...`. Without this check anyone could
 * post a fake payment confirmation and take an item for free.
 */
export async function isVerifiedStripeWebhook(header, rawBody, secret, { toleranceSeconds = 300 } = {}) {
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    String(header)
      .split(",")
      .map((part) => part.split("=").map((piece) => piece.trim()))
      .filter((pair) => pair.length === 2)
  );
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSeconds) return false;

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parts.v1, "hex"));
  } catch {
    return false;
  }
}
