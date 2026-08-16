/**
 * Routes an inbound message that belongs to a deal rather than to selling.
 *
 * Kept out of the webhook handler so the branching is testable without HTTP,
 * and so the selling path stays readable.
 */

import {
  formatAskPickupDetails,
  formatBuyerDeclined,
  formatCannotNegotiate,
  formatCounterOffer,
  formatItemForBuyer,
  formatOfferRefused,
  formatPaymentRequest,
  formatSellerApproval,
  formatSellerDeclined,
  sendLinqReply
} from "./linq.mjs";
import { closeDeal, dealForBuyer, dealForSeller, isNo, isYes, startDeal, updateDeal } from "./deals.mjs";
import { evaluateOffer, parseListingCode, parseOffer, splitPayment } from "./negotiation.mjs";
import { findListingByCode, findListingById, insertOrder } from "./store.mjs";
import { createCheckoutSession } from "./stripe.mjs";

const reply = (chatId, text, key) => sendLinqReply({ chatId, text, idempotencyKey: key });

/**
 * @returns {Promise<{handled: boolean, status?: string}>} handled:false means
 *   the message was not part of a deal and the selling path should take it.
 */
export async function handleDealMessage({ chatId, text, eventId, deps = {} }) {
  const send = deps.send ?? reply;

  // A buyer naming a listing code starts a negotiation, even mid-conversation.
  const code = parseListingCode(text);
  if (code) {
    const listing = await findListingByCode(code);
    if (!listing) return { handled: true, status: "unknown_code", sent: await send(chatId, `I could not find listing ${code}.`, eventId) };

    const deal = startDeal({ listing, buyerChatId: chatId, sellerChatId: listing.sellerChatId ?? listing.sellerId });
    await send(chatId, formatItemForBuyer(listing), eventId);
    return { handled: true, status: "negotiating", dealId: deal.id };
  }

  const sellerDeal = dealForSeller(chatId);
  if (sellerDeal) return handleSellerTurn({ deal: sellerDeal, chatId, text, eventId, send, deps });

  const buyerDeal = dealForBuyer(chatId);
  if (buyerDeal) return handleBuyerTurn({ deal: buyerDeal, chatId, text, eventId, send, deps });

  return { handled: false };
}

async function handleBuyerTurn({ deal, chatId, text, eventId, send, deps }) {
  if (deal.state !== "buyer_offering") return { handled: false };

  const listing = await findListingById(deal.listingId);
  if (!listing) return { handled: true, status: "listing_gone" };

  // Accepting a number the agent itself named is a done deal. Re-evaluating it
  // would let the agent counter above its own offer, which is bad faith and
  // leaves the buyer stuck in a loop.
  if (isYes(text) && deal.pendingCounter != null) {
    updateDeal(deal.id, { agreedPrice: deal.pendingCounter, state: "seller_approving" });
    if (deal.sellerChatId) await send(deal.sellerChatId, formatSellerApproval(deal, deal.pendingCounter), `${eventId}-seller`);
    await send(chatId, `Offer of $${deal.pendingCounter} sent to the seller. I will text you as soon as they answer.`, eventId);
    return { handled: true, status: "awaiting_seller" };
  }

  const offer = isYes(text) ? listing.price : parseOffer(text);
  if (offer == null) return { handled: false };

  const result = evaluateOffer({
    offer,
    price: listing.price,
    floorPrice: listing.floorPrice,
    previousCounters: deal.counters
  });

  if (result.action === "cannot_negotiate") {
    await send(chatId, formatCannotNegotiate(listing), eventId);
    return { handled: true, status: "not_priced" };
  }

  if (result.action === "refuse") {
    await send(chatId, formatOfferRefused(listing, result.counterOffer), eventId);
    updateDeal(deal.id, { pendingCounter: result.counterOffer });
    return { handled: true, status: "refused" };
  }

  if (result.action === "counter") {
    updateDeal(deal.id, { counters: deal.counters + 1, pendingCounter: result.counterOffer });
    await send(chatId, formatCounterOffer(listing, result.counterOffer), eventId);
    return { handled: true, status: "countered" };
  }

  // Accepted: the seller now has to agree before anything is arranged.
  updateDeal(deal.id, { agreedPrice: offer, state: "seller_approving" });
  if (deal.sellerChatId) await send(deal.sellerChatId, formatSellerApproval(deal, offer), `${eventId}-seller`);
  await send(chatId, `Offer of $${offer} sent to the seller. I will text you as soon as they answer.`, eventId);
  return { handled: true, status: "awaiting_seller" };
}

async function handleSellerTurn({ deal, chatId, text, eventId, send, deps }) {
  if (deal.state === "seller_approving") {
    if (isNo(text)) {
      await send(chatId, formatSellerDeclined(deal), eventId);
      await send(deal.buyerChatId, formatBuyerDeclined(deal), `${eventId}-buyer`);
      updateDeal(deal.id, { state: "buyer_offering", agreedPrice: null });
      return { handled: true, status: "seller_declined" };
    }
    if (!isYes(text)) return { handled: false };

    updateDeal(deal.id, { state: "seller_arranging" });
    await send(chatId, formatAskPickupDetails(deal), eventId);
    return { handled: true, status: "awaiting_pickup_details" };
  }

  // seller_arranging: whatever they send is the address and time.
  const details = String(text ?? "").trim();
  if (details.length < 5) return { handled: false };

  const [address, ...rest] = details.split(/,(?=[^,]*$)/);
  updateDeal(deal.id, {
    pickupAddress: (address ?? details).trim(),
    pickupTime: (rest.join(",") || "as arranged").trim(),
    state: "buyer_paying"
  });

  const payment = await createOrderAndPaymentLink(deal, deps);
  if (!payment.ok) {
    await send(chatId, "I could not create the payment link. Nothing has been charged.", eventId);
    return { handled: true, status: "payment_link_failed", error: payment.error };
  }

  await send(deal.buyerChatId, formatPaymentRequest(deal, payment.url), `${eventId}-buyer`);
  await send(chatId, "Sent to the buyer for payment. I will text you the moment it clears.", eventId);
  return { handled: true, status: "awaiting_payment", orderId: payment.orderId };
}

async function createOrderAndPaymentLink(deal, deps) {
  const listing = await findListingById(deal.listingId);
  if (!listing) return { ok: false, error: "listing_gone" };

  const split = splitPayment(deal.agreedPrice);
  const order = {
    id: crypto.randomUUID(),
    listingId: listing.id,
    buyerChatId: deal.buyerChatId,
    ...split,
    pickupAddress: deal.pickupAddress,
    pickupTime: deal.pickupTime,
    status: "awaiting_payment",
    stripeSessionId: null,
    stripePaymentUrl: null
  };

  try {
    const webUrl = process.env.PUBLIC_WEB_URL || "https://room2store.example";
    const session = await (deps.createCheckoutSession ?? createCheckoutSession)({
      order,
      listing,
      successUrl: `${webUrl}/paid?order=${order.id}`,
      cancelUrl: `${webUrl}/store`
    });

    order.stripeSessionId = session.id;
    order.stripePaymentUrl = session.url;
    await insertOrder(order);
    updateDeal(deal.id, { orderId: order.id });
    return { ok: true, url: session.url, orderId: order.id };
  } catch (error) {
    console.log(JSON.stringify({ event: "stripe.checkout_failed", error: error.message }));
    return { ok: false, error: error.message };
  }
}

export { closeDeal };
