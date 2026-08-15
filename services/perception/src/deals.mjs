/**
 * The deal state machine, from a buyer naming a listing code through to a paid
 * order.
 *
 * Both sides of the conversation are the same Linq number, so a deal tracks
 * which chat is the buyer and which is the seller and what each is expected to
 * say next. State is per-process; a restart loses in-flight negotiations, which
 * is survivable because nothing has been paid at that point.
 */

import { randomUUID } from "node:crypto";

/** buyer_offering → seller_approving → seller_arranging → buyer_paying → paid */
const deals = new Map();
const byBuyerChat = new Map();
const bySellerChat = new Map();

export function startDeal({ listing, buyerChatId, sellerChatId }) {
  const deal = {
    id: randomUUID(),
    listingId: listing.id,
    listingCode: listing.code,
    listingName: listing.name,
    buyerChatId,
    sellerChatId,
    counters: 0,
    agreedPrice: null,
    pickupAddress: null,
    pickupTime: null,
    orderId: null,
    state: "buyer_offering"
  };

  deals.set(deal.id, deal);
  byBuyerChat.set(buyerChatId, deal.id);
  if (sellerChatId) bySellerChat.set(sellerChatId, deal.id);
  return deal;
}

export function dealForBuyer(chatId) {
  const id = byBuyerChat.get(chatId);
  return id ? deals.get(id) ?? null : null;
}

export function dealForSeller(chatId) {
  const id = bySellerChat.get(chatId);
  const deal = id ? deals.get(id) ?? null : null;
  // A seller only has a pending question while the deal is waiting on them.
  return deal && (deal.state === "seller_approving" || deal.state === "seller_arranging") ? deal : null;
}

export function getDeal(id) {
  return deals.get(id) ?? null;
}

export function updateDeal(id, changes) {
  const deal = deals.get(id);
  if (!deal) return null;
  Object.assign(deal, changes);
  return deal;
}

/** A buyer chat can only hold one live negotiation at a time. */
export function closeDeal(id) {
  const deal = deals.get(id);
  if (!deal) return null;
  byBuyerChat.delete(deal.buyerChatId);
  if (deal.sellerChatId) bySellerChat.delete(deal.sellerChatId);
  return deal;
}

export function resetDeals() {
  deals.clear();
  byBuyerChat.clear();
  bySellerChat.clear();
}

const YES = /^(yes|yep|yeah|y|ok|okay|sure|accept|deal|agreed)\b/i;
const NO = /^(no|nope|n|decline|reject|cancel)\b/i;

export function isYes(text) {
  return YES.test(String(text ?? "").trim());
}

export function isNo(text) {
  return NO.test(String(text ?? "").trim());
}
