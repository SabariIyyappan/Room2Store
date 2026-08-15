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
const ASK_FOR_ITEMS = /^(1|OLD|ITEMS|MY ITEMS|OLD ITEMS|PRODUCTS|OLD PRODUCTS|HISTORY|STATUS)$/i;

const WELCOME = "Welcome to Room2Store!\n\nSend a photo of anything you want to sell. No caption needed.\n\nAdd 'sell it for me' or any condition details, and I will take it from there.";
const PHOTO_ACK = "Photo received.\n\nI am identifying the item and will prepare the next listing step shortly.";
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

  if (photo) return { ...base, reply: PHOTO_ACK };
  if (ASK_FOR_ITEMS.test(text)) {
    return { ...base, reply: session.hasHistory ? formatItemList(session.items) : NOTHING_YET };
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

/** Buyer-facing summary of a vision identification, formatted for iMessage. */
export function formatIdentificationReply(identification) {
  const vision = identification?.vision;
  if (!vision) return "Photo received.\n\nI am identifying the item and will prepare the next listing step shortly.";

  const lines = [
    `I see: ${[vision.brand, vision.product_name].filter((part) => part && part.toLowerCase() !== "unknown").join(" ") || vision.product_name}`,
    `Category: ${vision.category || "unknown"}`
  ];

  if (identification.needsModelNumber) {
    lines.push("", "I could not read a model or part number on it. Reply with the model / part number and I will price it accurately.");
  } else {
    lines.push(`Model: ${vision.model_number}`, "", "Reply with the condition (new, excellent, good, fair) and I will price it.");
  }

  if (identification.fieldsEditable) {
    lines.push("", "I am not confident on this one. Correct me if the product or brand is wrong.");
  }

  return lines.join("\n");
}
