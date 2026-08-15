import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import { confirmIdentification, identifyPhoto } from "./catalog.mjs";
import { reviewItem } from "../../compliance/src/verdict.mjs";
import {
  describeInboundLinqMessage,
  fetchLinqMediaAsDataUrl,
  formatIdentificationReply,
  isOptOutEvent,
  sendLinqReply
} from "./linq.mjs";
import { recordItem, startTurn } from "./sessions.mjs";

const directory = fileURLToPath(new URL("..", import.meta.url));
const publicDirectory = join(directory, "public");
const items = new Map();
const processedWebhookEvents = new Set();
const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readRawBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 7_000_000) throw new Error("Image is too large. Use a photo under 5 MB.");
  }
  return body;
}

async function readJson(request) {
  return JSON.parse((await readRawBody(request)) || "{}");
}

function isVerifiedLinqWebhook(request, rawBody) {
  const secret = process.env.LINQ_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = request.headers["webhook-id"];
  const timestamp = request.headers["webhook-timestamp"];
  const signatures = request.headers["webhook-signature"];
  if (!id || !timestamp || !signatures || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return signatures.split(" ").some((signature) => {
    if (!signature.startsWith("v1,")) return false;
    try {
      return timingSafeEqual(Buffer.from(expected, "base64"), Buffer.from(signature.slice(3), "base64"));
    } catch {
      return false;
    }
  });
}

async function serveFile(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const path = normalize(join(publicDirectory, requested));
  if (!path.startsWith(publicDirectory)) return json(response, 403, { error: "Forbidden" });
  try {
    const content = await readFile(path);
    response.writeHead(200, { "content-type": mimeTypes[extname(path)] ?? "application/octet-stream" });
    response.end(content);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

/**
 * Downloads the inbound photo and identifies it. A provider failure must not
 * silently become a fabricated match, so the buyer gets the plain acknowledgement.
 */
async function describePhotoReply(inbound) {
  try {
    const imageDataUrl = await fetchLinqMediaAsDataUrl(inbound.photo);
    const identification = await identifyPhoto({ imageName: inbound.photo.name, imageDataUrl });
    items.set(inbound.chatId, identification);
    recordItem(inbound.chatId, {
      name: identification.candidates[0]?.name,
      modelNumber: identification.vision?.model_number,
      status: identification.needsModelNumber ? "awaiting_model_number" : "identified"
    });
    return formatIdentificationReply(identification);
  } catch (error) {
    console.log(JSON.stringify({ event: "linq.photo_identification_failed", error: error.message }));
    return inbound.reply;
  }
}

async function handleLinqWebhook(request, response) {
  const rawBody = await readRawBody(request);
  if (!isVerifiedLinqWebhook(request, rawBody)) return json(response, 401, { error: "Invalid Linq webhook signature." });

  const event = JSON.parse(rawBody);
  if (processedWebhookEvents.has(event.event_id)) return json(response, 200, { status: "duplicate" });
  processedWebhookEvents.add(event.event_id);

  // An opt-out must not create or refresh a session, so the turn is only
  // started for a chat we are actually going to talk to.
  const chatId = event.data?.chat?.id;
  const session = chatId && !isOptOutEvent(event) ? startTurn(chatId) : { isNewSession: true, hasHistory: false, items: [] };

  const inbound = describeInboundLinqMessage(event, session);
  if (inbound?.reply && !inbound.optedOut) {
    const text = inbound.photo ? await describePhotoReply(inbound) : inbound.reply;
    await sendLinqReply({ chatId: inbound.chatId, text, idempotencyKey: event.event_id });
  }
  return json(response, 200, { status: inbound?.optedOut ? "opted_out" : "processed" });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === "POST" && url.pathname === "/webhooks/linq") {
      return await handleLinqWebhook(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/identify") {
      const input = await readJson(request);
      if (!input.imageName || !input.imageDataUrl?.startsWith("data:image/")) {
        return json(response, 400, { error: "Send a photo to identify." });
      }
      const identification = await identifyPhoto(input);
      const sessionId = crypto.randomUUID();
      items.set(sessionId, identification);
      return json(response, 200, { sessionId, ...identification });
    }

    const confirmation = url.pathname.match(/^\/api\/items\/([^/]+)\/confirm$/);
    if (request.method === "POST" && confirmation) {
      const identification = items.get(confirmation[1]);
      if (!identification) return json(response, 404, { error: "Identification session expired. Upload the photo again." });
      const item = confirmIdentification({ identification, ...(await readJson(request)) });
      items.delete(confirmation[1]);
      const verdict = reviewItem({ item });
      return json(response, 201, { item, verdict });
    }

    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });
    if (request.method === "GET") return serveFile(url.pathname, response);
    return json(response, 405, { error: "Method not allowed" });
  } catch (error) {
    json(response, 500, { error: error.message || "Unexpected server error" });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Photo identification is running at http://localhost:${server.address().port}`));
