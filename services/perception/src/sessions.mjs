/**
 * Per-chat conversation state.
 *
 * A chat that has been quiet for 30 minutes is treated as a fresh conversation
 * on its next inbound message, even though Linq keeps the same chat id forever.
 * Items already sent in that chat survive the reset, so a returning seller can
 * ask about them.
 *
 * This lives in memory: a redeploy or a free-tier spin-down clears it. Move it
 * behind the database before anything depends on it surviving.
 */

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const chats = new Map();

function getChat(chatId) {
  let chat = chats.get(chatId);
  if (!chat) {
    chat = { lastSeenAt: 0, items: [] };
    chats.set(chatId, chat);
  }
  return chat;
}

/**
 * Records an inbound message and reports what kind of turn it is.
 * @returns {{isNewSession: boolean, hasHistory: boolean, items: object[], idleMs: number}}
 */
export function startTurn(chatId, now = Date.now()) {
  const chat = getChat(chatId);
  const idleMs = chat.lastSeenAt === 0 ? Infinity : now - chat.lastSeenAt;
  const isNewSession = idleMs > SESSION_TIMEOUT_MS;
  chat.lastSeenAt = now;

  return { isNewSession, hasHistory: chat.items.length > 0, items: [...chat.items], idleMs };
}

/** Remembers an identified item so the seller can ask about it later. */
export function recordItem(chatId, item, now = Date.now()) {
  const chat = getChat(chatId);
  chat.items.push({
    name: item.name ?? "Unnamed item",
    modelNumber: item.modelNumber ?? null,
    status: item.status ?? "identified",
    naivePrice: item.naivePrice ?? null,
    receivedAt: now
  });
  return chat.items.length;
}

export function listItems(chatId) {
  return [...getChat(chatId).items];
}

/** Test seam: drops all remembered chats. */
export function resetSessions() {
  chats.clear();
}
