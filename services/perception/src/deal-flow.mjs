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
  formatNegotiationHelp,
  formatOfferRefused,
  formatPaymentRequest,
  formatSellerApproval,
  formatSellerCounter,
  formatSellerDeclined,
  sendLinqReply
} from "./linq.mjs";
import { closeDeal, dealForBuyer, dealForSeller, isNo, isOptOut, isYes, startDeal, updateDeal } from "./deals.mjs";
import { evaluateOffer, parseListingCode, parseOffer, softenPrice, splitPayment, wantsLowerPrice } from "./negotiation.mjs";
import { findListingByCode, findListingById, insertOrder } from "./store.mjs";
import { createCheckoutSession } from "./stripe.mjs";

const reply = (chatId, text, key) => sendLinqReply({ chatId, text, idempotencyKey: key });

/**
 * Sends to the *other* party. A failure here must never abort the turn: the
 * person in front of us still deserves an answer, and losing a cross-chat
 * notice is far better than the deal silently stalling.
 */
async function notify(send, chatId, text, key) {
  if (!chatId) return false;
  try {
    await send(chatId, text, key);
    return true;
  } catch (error) {
    console.log(JSON.stringify({ event: "deal.notify_failed", chat: chatId, error: error.message }));
    return false;
  }
}

/**
 * @returns {Promise<{handled: boolean, status?: string}>} handled:false means
 *   the message was not part of a deal and the selling path should take it.
 */
export async function handleDealMessage({ chatId, text, eventId, deps = {} }) {
  const send = deps.send ?? reply;

  // An opt-out outranks any negotiation. The webhook checks this first, but a
  // legal requirement must not depend on the order two functions are called in.
  if (isOptOut(text)) return { handled: false, status: "opted_out" };

  // A buyer naming a listing code starts a negotiation, even mid-conversation.
  const code = parseListingCode(text);
  if (code) {
    const listing = await findListingByCode(code);
    if (!listing) return { handled: true, status: "unknown_code", sent: await send(chatId, `I could not find listing ${code}.`, eventId) };

    // A sold or withdrawn item must not be negotiable: two buyers agreeing on
    // the same item is the one failure that costs someone real money.
    if (listing.status !== "live") {
      await send(chatId, `The ${listing.name} is no longer available — it is ${listing.status}.`, eventId);
      return { handled: true, status: "not_available" };
    }

    const deal = startDeal({ listing, buyerChatId: chatId, sellerChatId: listing.sellerChatId ?? null });
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
    const agreed = deal.pendingCounter;

    // The seller named this number, so asking them to approve it again is a
    // pointless round trip: go straight to arranging the pickup.
    if (deal.pendingCounterFrom === "seller") {
      updateDeal(deal.id, { agreedPrice: agreed, state: "seller_arranging" });
      const settled = { ...deal, agreedPrice: agreed };
      await notify(send, deal.sellerChatId, formatAskPickupDetails(settled), `${eventId}-seller`);
      await send(chatId, `Agreed at $${agreed}. Getting the pickup details from the seller now.`, eventId);
      return { handled: true, status: "awaiting_pickup_details" };
    }

    updateDeal(deal.id, { agreedPrice: agreed, state: "seller_approving" });
    await notify(send, deal.sellerChatId, formatSellerApproval(deal, agreed), `${eventId}-seller`);
    await send(chatId, `Offer of $${agreed} sent to the seller. I will text you as soon as they answer.`, eventId);
    return { handled: true, status: "awaiting_seller" };
  }

  // "can you do better?" is a haggle, not small talk. Answering with a real
  // number keeps the negotiation moving instead of dropping the buyer back
  // into the selling script.
  if (wantsLowerPrice(text)) {
    if (listing.price == null) {
      await send(chatId, formatCannotNegotiate(listing), eventId);
      return { handled: true, status: "not_priced" };
    }
    const softened = softenPrice(deal.pendingCounter ?? listing.price, listing.floorPrice);
    updateDeal(deal.id, { counters: deal.counters + 1, pendingCounter: softened, pendingCounterFrom: "agent" });
    await send(chatId, formatCounterOffer(listing, softened), eventId);
    return { handled: true, status: "countered" };
  }

  // An unpriced item cannot be agreed to at any number, so say so rather than
  // dropping the buyer back into the selling script.
  if (isYes(text) && listing.price == null) {
    await send(chatId, formatCannotNegotiate(listing), eventId);
    return { handled: true, status: "not_priced" };
  }

  const offer = isYes(text) ? listing.price : parseOffer(text);
  if (offer == null) {
    // Mid-negotiation, anything unrecognised is still about this item. Falling
    // through here told buyers to "send a photo", which made no sense to them.
    await send(chatId, formatNegotiationHelp(listing), eventId);
    return { handled: true, status: "reprompted" };
  }

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
  const reached = await notify(send, deal.sellerChatId, formatSellerApproval({ ...deal, agreedPrice: offer }, offer), `${eventId}-seller`);
  await send(
    chatId,
    reached
      ? `Offer of $${offer} sent to the seller. I will text you as soon as they answer.`
      : `Offer of $${offer} recorded. I am reaching the seller now and will text you as soon as they answer.`,
    eventId
  );
  return { handled: true, status: "awaiting_seller", sellerReached: reached };
}

async function handleSellerTurn({ deal, chatId, text, eventId, send, deps }) {
  if (deal.state === "seller_approving") {
    if (isNo(text)) {
      await send(chatId, formatSellerDeclined(deal), eventId);
      await notify(send, deal.buyerChatId, formatBuyerDeclined(deal), `${eventId}-buyer`);
      updateDeal(deal.id, { state: "buyer_offering", agreedPrice: null });
      return { handled: true, status: "seller_declined" };
    }

    // A seller naming a number is countering, not accepting. The haggle stays
    // open until one side actually says yes or no.
    if (!isYes(text)) {
      const counter = parseOffer(text);
      if (counter == null) return { handled: false };

      // Remembered so accepting it does not bounce back to the seller for
      // approval of a number they just named themselves.
      updateDeal(deal.id, { state: "buyer_offering", agreedPrice: null, pendingCounter: counter, pendingCounterFrom: "seller" });
      await notify(send, deal.buyerChatId, formatSellerCounter(deal, counter), `${eventId}-buyer`);
      await send(chatId, `Told the buyer $${counter}. I will let you know what they say.`, eventId);
      return { handled: true, status: "seller_countered" };
    }

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

  await notify(send, deal.buyerChatId, formatPaymentRequest(deal, payment.url), `${eventId}-buyer`);
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
