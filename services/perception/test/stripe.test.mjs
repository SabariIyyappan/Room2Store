import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createCheckoutSession, isStripeConfigured, isVerifiedStripeWebhook } from "../src/stripe.mjs";

const listing = {
  id: "listing-1",
  code: "R2S-7QK4",
  name: "blue plastic stacking chair",
  condition: "good",
  photoUrl: "https://cdn.linqapp.com/photo.jpg",
  location: { city: "San Francisco", state: "CA" }
};

const order = { id: "order-1", amountCents: 14500, platformFeeCents: 1450, sellerPayoutCents: 13050 };

test("configuration is reported from the key alone", () => {
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal(isStripeConfigured(), false);
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  assert.equal(isStripeConfigured(), true);
});

test("the checkout session carries the amount, the split and the order id", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  let sent;

  const result = await createCheckoutSession(
    { order, listing, successUrl: "https://web/ok", cancelUrl: "https://web/no" },
    {
      fetchImpl: async (url, options) => {
        sent = { url, body: new URLSearchParams(options.body), auth: options.headers.authorization };
        return { ok: true, json: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" }) };
      }
    }
  );

  assert.equal(result.url, "https://checkout.stripe.com/pay/cs_test_1");
  assert.match(sent.url, /\/checkout\/sessions$/);
  assert.equal(sent.auth, "Bearer sk_test_x");
  assert.equal(sent.body.get("line_items[0][price_data][unit_amount]"), "14500");
  assert.equal(sent.body.get("client_reference_id"), "order-1");
  assert.equal(sent.body.get("metadata[platform_fee_cents]"), "1450");
  assert.equal(sent.body.get("metadata[seller_payout_cents]"), "13050");
});

test("a Stripe error surfaces its message rather than a bare status", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  await assert.rejects(
    createCheckoutSession(
      { order, listing, successUrl: "https://web/ok", cancelUrl: "https://web/no" },
      { fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid API Key" } }) }) }
    ),
    /Invalid API Key/
  );
});

function signStripe(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

test("a correctly signed webhook is accepted", async () => {
  const body = JSON.stringify({ type: "checkout.session.completed" });
  assert.equal(await isVerifiedStripeWebhook(signStripe(body, "whsec_test"), body, "whsec_test"), true);
});

test("a forged or tampered webhook is rejected", async () => {
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const header = signStripe(body, "whsec_test");

  assert.equal(await isVerifiedStripeWebhook(header, body, "wrong_secret"), false, "wrong secret must fail");
  assert.equal(await isVerifiedStripeWebhook(header, `${body} tampered`, "whsec_test"), false, "tampered body must fail");
  assert.equal(await isVerifiedStripeWebhook(null, body, "whsec_test"), false);
  assert.equal(await isVerifiedStripeWebhook(header, body, null), false, "no secret configured must fail closed");
});

test("a replayed webhook outside the tolerance window is rejected", async () => {
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const old = Math.floor(Date.now() / 1000) - 4000;
  assert.equal(await isVerifiedStripeWebhook(signStripe(body, "whsec_test", old), body, "whsec_test"), false);
});
