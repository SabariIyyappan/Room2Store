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

export function describeInboundLinqMessage(event) {
  if (event.event_type !== "message.received") return null;

  const parts = event.data?.parts;
  const chatId = event.data?.chat?.id;
  if (!chatId || !Array.isArray(parts)) return null;

  const text = parts.filter((part) => part.type === "text").map((part) => part.value).join(" ").trim();
  // Inbound media parts carry a cdn.linqapp.com URL and no mime_type field; the
  // type is inferred from the download, so accept any media part here.
  const photo = parts.find((part) => part.type === "media" && (part.url ?? part.value));
  if (/^(STOP|UNSUBSCRIBE|OPTOUT|CANCEL|END|QUIT)$/i.test(text)) return { chatId, optedOut: true };

  return {
    chatId,
    optedOut: false,
    text,
    photo: photo ? { url: photo.url ?? photo.value, mimeType: photo.mime_type ?? null, name: photo.filename ?? "photo.jpg" } : null,
    reply: photo
      ? "Photo received.\n\nI am identifying the item and will prepare the next listing step shortly."
      : "Welcome to Room2Store!\n\nSend a photo of anything you want to sell. No caption needed.\n\nAdd 'sell it for me' or any condition details, and I will take it from there."
  };
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
