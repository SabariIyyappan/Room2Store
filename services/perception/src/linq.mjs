import { buildProductTitle } from "./vision.mjs";
import { isZipCode, normalizeZip } from "./geo.mjs";

const LINQ_API_URL = process.env.LINQ_API_URL || "https://api.linqapp.com/api/partner/v3";

function getApiKey() {
  if (!process.env.LINQ_API_KEY) throw new Error("LINQ_API_KEY is not configured.");
  return process.env.LINQ_API_KEY;
}

export async function sendLinqReply({ chatId, text, idempotencyKey }) {
  const response = await fetch(`${LINQ_API_URL}/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${getApiKey()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: {
        parts: [{ type: "text", value: text }],
        idempotency_key: idempotencyKey
      }
    })
  });

  if (!response.ok) throw new Error(`Linq reply failed with status ${response.status}.`);
  return response.json();
}

const MAX_MEDIA_BYTES = 5_000_000;

const OPT_OUT = /^(STOP|UNSUBSCRIBE|OPTOUT|CANCEL|END|QUIT)$/i;
const CONDITION = /^(new|like new|excellent|good|fair|used)\b/i;
const ASK_FOR_ITEMS = /^(1|OLD|ITEMS|MY ITEMS|OLD ITEMS|PRODUCTS|OLD PRODUCTS|HISTORY|STATUS)$/i;

const WELCOME = "Welcome to Room2Store!\n\nSend a photo of anything you want to sell. No caption needed.\n\nAdd 'sell it for me' or any condition details, and I will take it from there.";
// Sent the moment a photo arrives; the identification follows in its own message.
export const PHOTO_RECEIVED = "Got it — looking at your photo now.";
// Sent instead of a result when identification could not run at all.
export const PHOTO_FAILED = "I could not get a good look at that one.\n\nTell me what it is and I will take it from there, or send another photo.";
const RETURNING = "Reply 1 to check on the items you sent before.";
const MID_SESSION = "Send a photo of the item and I will take it from there.";
const NOTHING_YET = "You have not sent me any items yet.\n\nSend a photo of something you want to sell and I will identify it.";

function inboundText(event) {
  const parts = event?.data?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.filter((part) => part.type === "text").map((part) => part.value).join(" ").trim();
}

/** Checked before a session is started, so an opt-out never refreshes one. */
export function isOptOutEvent(event) {
  return OPT_OUT.test(inboundText(event));
}

function formatItemList(items) {
  const lines = items.map((item, index) => {
    const price = item.naivePrice?.amount == null ? "pricing in progress" : `$${item.naivePrice.amount} provisional`;
    const model = item.modelNumber && item.modelNumber !== "MODEL_UNKNOWN" ? ` (${item.modelNumber})` : "";
    return `${index + 1}. ${item.name}${model} — ${price}`;
  });

  return `Here is what you have sent me so far:\n\n${lines.join("\n")}\n\nSend another photo to add one.`;
}

/**
 * @param {object} event the message.received payload
 * @param {object} [session] from startTurn(): whether this is a fresh
 *   conversation, and what the chat has sent before
 */
export function describeInboundLinqMessage(event, session = { isNewSession: true, hasHistory: false, items: [] }) {
  if (event.event_type !== "message.received") return null;

  const parts = event.data?.parts;
  const chatId = event.data?.chat?.id;
  if (!chatId || !Array.isArray(parts)) return null;

  const text = inboundText(event);
  // Inbound media parts carry a cdn.linqapp.com URL and no mime_type field; the
  // type is inferred from the download, so accept any media part here.
  const photo = parts.find((part) => part.type === "media" && (part.url ?? part.value));
  if (OPT_OUT.test(text)) return { chatId, optedOut: true };

  const base = {
    chatId,
    optedOut: false,
    text,
    isNewSession: session.isNewSession,
    photo: photo ? { url: photo.url ?? photo.value, mimeType: photo.mime_type ?? null, name: photo.filename ?? "photo.jpg" } : null
  };

  if (photo) return { ...base, reply: PHOTO_RECEIVED };
  if (ASK_FOR_ITEMS.test(text)) {
    return { ...base, reply: session.hasHistory ? formatItemList(session.items) : NOTHING_YET };
  }

  // A condition only means something while an item is waiting for one.
  if (session.awaitingCondition && CONDITION.test(text)) {
    return { ...base, condition: normalizeCondition(text) };
  }

  // Likewise a ZIP: five digits mean nothing unless an item is waiting for one.
  if (session.awaitingLocation && isZipCode(text)) {
    return { ...base, zip: normalizeZip(text) };
  }

  // The returning-seller option is only offered to a chat that actually has
  // items; a first-time sender never sees a prompt that would do nothing.
  if (session.isNewSession) {
    return { ...base, reply: session.hasHistory ? `${WELCOME}\n\n${RETURNING}` : WELCOME };
  }

  return { ...base, reply: MID_SESSION };
}

/**
 * Downloads inbound media and returns it as the data URL the vision path expects.
 *
 * Attachment URLs are public CDN links — persistent ones are long-lived, ephemeral
 * ones are pre-signed and expire in 15 minutes. Either way they take no auth, so
 * the Linq API key must never be sent here.
 */
export async function fetchLinqMediaAsDataUrl(photo) {
  if (!photo?.url) throw new Error("Inbound photo has no media URL.");

  const response = await fetch(photo.url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Linq media download failed with status ${response.status}.`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw new Error("Photo is larger than 5 MB.");

  const mimeType = (photo.mimeType || response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  if (!mimeType.startsWith("image/")) throw new Error(`Inbound attachment is ${mimeType}, not an image.`);

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function normalizeCondition(text) {
  const word = CONDITION.exec(text)[1].toLowerCase();
  return word === "like new" ? "new" : word === "used" ? "good" : word;
}

/** Asked once the condition is known, because a buyer radius needs somewhere to measure from. */
export function formatLocationRequest(item) {
  return [
    `Got it — ${item.name}, ${item.condition} condition.`,
    "",
    "What ZIP code is it in for pickup? Buyers nearby will see it first."
  ].join("\n");
}

/**
 * The published listing. No price is quoted here: a price only exists once the
 * pricing study has measured one, and inventing a number in the meantime is the
 * exact thing this product claims not to do.
 */
export function formatListingPublished(item, { webUrl } = {}) {
  const place = item.location?.city ? `${item.location.city}, ${item.location.state}` : item.location?.zip;
  const lines = [
    "Your listing is live:",
    "",
    item.name,
    `Condition: ${item.condition}`,
    `Pickup: ${place}`,
    "",
    item.measuredPrice
      ? `Price: $${item.measuredPrice}`
      : "Price: being measured now. I will text you the moment the pricing study lands."
  ];

  if (webUrl) lines.push("", `See it here: ${webUrl}`);
  lines.push("", "Send another photo to add another item.");
  return lines.join("\n");
}

const VETO_REASONS = {
  prohibited_weapon: "weapons cannot be listed",
  prohibited_car_seat: "used car seats and booster seats cannot be resold safely",
  prohibited_medication: "medication and supplements cannot be listed",
  prohibited_recalled: "recalled products cannot be listed",
  unsafe_pickup_address: "a street address cannot appear in a public listing",
  contact_not_opted_in: "this contact has not opted in"
};

/**
 * Sent instead of a listing when compliance refuses. It names the reason: a
 * seller told only "no" will just send the same item again.
 */
export function formatListingVetoed(item, verdict) {
  const explained = verdict.rulesTriggered
    .map((rule) => VETO_REASONS[rule] ?? (rule.startsWith("excluded_object:") ? "you asked me to leave this one out" : null))
    .filter(Boolean);

  return [
    `I cannot list the ${item.name}.`,
    "",
    explained.length > 0 ? `Reason: ${explained[0]}.` : "It did not pass the safety check.",
    "",
    "Send a photo of something else and I will take it from there."
  ].join("\n");
}

/** Sent to the seller once the pricing study has measured a real number. */
export function formatPriceMeasured(listing) {
  const lines = [
    "Your price is in — measured on real people, not guessed.",
    "",
    listing.name,
    `Price: $${listing.price}`
  ];
  if (listing.floorPrice) lines.push(`I will not accept below $${listing.floorPrice}.`);
  lines.push("", "It is live on Room2Store now.");
  return lines.join("\n");
}

/** Sent when the ZIP could not be resolved. */
export function formatLocationRejected(zip) {
  return `I could not find ZIP ${zip}. Send the five-digit ZIP code where the item can be picked up.`;
}

function isUnknown(value) {
  return !value || value.toLowerCase() === "unknown" || value === "MODEL_UNKNOWN";
}

/**
 * Buyer-facing summary of an identification, in marketplace-listing voice.
 *
 * A missing brand or model never blocks the reply: the seller always gets a
 * usable name for the item, the way a Facebook Marketplace listing reads.
 */
export function formatIdentificationReply(identification) {
  const vision = identification?.vision;
  if (!vision) return PHOTO_FAILED;

  const modelKnown = !isUnknown(vision.model_number);
  const title = buildProductTitle(vision.brand, vision.product_name);

  const lines = [`Looks like a used ${title}.`];
  if (modelKnown) lines.push(`Model number on it: ${vision.model_number}`);

  lines.push("", "What condition is it in — new, excellent, good, or fair?");

  if (!modelKnown) {
    lines.push("", "If you can find a model or part number on a label, send it too and I can price it more accurately.");
  }
  if (identification.fieldsEditable) {
    lines.push("", "Correct me if I have got the item wrong.");
  }

  return lines.join("\n");
}
