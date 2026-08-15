import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import { confirmIdentification, identifyPhoto } from "./catalog.mjs";
import { canDeploy, reviewItem } from "../../compliance/src/verdict.mjs";
import {
  describeInboundLinqMessage,
  fetchLinqMediaAsDataUrl,
  formatIdentificationReply,
  formatListingPublished,
  formatListingVetoed,
  formatLocationRejected,
  formatPriceMeasured,
  formatLocationRequest,
  formatBuyerPaid,
  formatSellerPaid,
  isOptOutEvent,
  PHOTO_FAILED,
  sendLinqReply
} from "./linq.mjs";
import { recordItem, setCondition, setLocation, startTurn } from "./sessions.mjs";
import { DEFAULT_RADIUS_MILES, lookupZip } from "./geo.mjs";
import { publishListing, queryListings, setMeasuredPrice } from "./listings.mjs";
import { handleDealMessage } from "./deal-flow.mjs";
import { initStore, markOrderPaid, findOrderById, findListingById, updateListing, storeBackend } from "./store.mjs";
import { isVerifiedStripeWebhook } from "./stripe.mjs";
import { getDeal } from "./deals.mjs";

const directory = fileURLToPath(new URL("..", import.meta.url));
const publicDirectory = join(directory, "public");
const items = new Map();
const processedWebhookEvents = new Set();
// Keeps in-flight identifications referenced so they are not lost mid-flight.
const pendingIdentifications = new Set();
const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const corsAllowlist = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeadersFor(origin) {
  if (corsAllowlist.includes("*")) {
    return {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400"
    };
  }
  if (!origin || !corsAllowlist.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
    "vary": "origin",
    "access-control-max-age": "86400"
  };
}

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
/**
 * Identifies the photo and sends the result as its own message.
 *
 * Runs after the webhook has already been acknowledged, so a slow vision call
 * cannot make Linq time out and retry the delivery.
 */
async function sendIdentificationResult(inbound, eventId) {
  let text = PHOTO_FAILED;
  try {
    const imageDataUrl = await fetchLinqMediaAsDataUrl(inbound.photo);
    const identification = await identifyPhoto({ imageName: inbound.photo.name, imageDataUrl });
    items.set(inbound.chatId, identification);
    recordItem(inbound.chatId, {
      name: identification.candidates[0]?.name,
      modelNumber: identification.vision?.model_number,
      category: identification.vision?.category,
      // Linq's persistent attachment URLs are public and long-lived, so the
      // storefront can show the seller's own photo rather than a placeholder.
      photoUrl: inbound.photo?.url ?? null,
      status: identification.needsModelNumber ? "awaiting_model_number" : "identified"
    });
    text = formatIdentificationReply(identification);
  } catch (error) {
    console.log(JSON.stringify({ event: "linq.photo_identification_failed", error: error.message }));
  }

  try {
    // A distinct key from the acknowledgement, or Linq treats it as a repeat.
    await sendLinqReply({ chatId: inbound.chatId, text, idempotencyKey: `${eventId}-result` });
  } catch (error) {
    console.log(JSON.stringify({ event: "linq.result_send_failed", error: error.message }));
  }
}

/**
 * Tells both sides a sale settled. Neither message is worth failing the webhook
 * over: the money has already moved, and Stripe would retry a non-200.
 */
async function notifyBothSidesPaid(order) {
  const listing = await findListingById(order.listingId);
  const deal = { listingName: listing?.name ?? "your item", agreedPrice: (order.amountCents / 100).toFixed(0), pickupAddress: order.pickupAddress, pickupTime: order.pickupTime };

  const messages = [
    { chatId: order.buyerChatId, text: formatBuyerPaid(deal), key: `paid-${order.id}-buyer` },
    { chatId: listing?.sellerChatId, text: formatSellerPaid(deal, order.sellerPayoutCents), key: `paid-${order.id}-seller` }
  ];

  for (const message of messages) {
    if (!message.chatId) continue;
    try {
      await sendLinqReply({ chatId: message.chatId, text: message.text, idempotencyKey: message.key });
    } catch (error) {
      console.log(JSON.stringify({ event: "linq.paid_notice_failed", chat: message.chatId, error: error.message }));
    }
  }

  if (listing) await updateListing(listing.id, { status: "sold" });
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
  if (!inbound || inbound.optedOut) {
    return json(response, 200, { status: inbound?.optedOut ? "opted_out" : "processed" });
  }

  // A buyer naming a listing code, or either side answering mid-deal, is
  // handled before the selling path so a deal is never mistaken for a new item.
  if (!inbound.photo) {
    const deal = await handleDealMessage({ chatId: inbound.chatId, text: inbound.text, eventId: event.event_id });
    if (deal.handled) return json(response, 200, { status: deal.status });
  }

  // The seller answered the condition question: record it and ask where it is.
  if (inbound?.condition && !inbound.optedOut) {
    const item = setCondition(inbound.chatId, inbound.condition);
    if (item) {
      await sendLinqReply({ chatId: inbound.chatId, text: formatLocationRequest(item), idempotencyKey: event.event_id });
      return json(response, 200, { status: "awaiting_location" });
    }
  }

  // The seller answered with a ZIP: resolve it, publish, and confirm.
  if (inbound?.zip && !inbound.optedOut) {
    let location;
    try {
      location = await lookupZip(inbound.zip);
    } catch (error) {
      console.log(JSON.stringify({ event: "zip.lookup_failed", zip: inbound.zip, error: error.message }));
      await sendLinqReply({ chatId: inbound.chatId, text: formatLocationRejected(inbound.zip), idempotencyKey: event.event_id });
      return json(response, 200, { status: "zip_rejected" });
    }

    const item = setLocation(inbound.chatId, location);
    if (item) {
      // The compliance gate runs before anything is published, not after. A
      // veto has to stop the listing existing at all, or it is decorative.
      const verdict = reviewItem({ item, listingCopy: `${item.name} ${item.condition}` });
      if (!canDeploy(verdict)) {
        item.status = "vetoed";
        console.log(JSON.stringify({ event: "compliance.vetoed", item: item.name, rules: verdict.rulesTriggered }));
        await sendLinqReply({
          chatId: inbound.chatId,
          text: formatListingVetoed(item, verdict),
          idempotencyKey: event.event_id
        });
        return json(response, 200, { status: "vetoed", verdict });
      }

      // Remembered so the seller can be texted when the price is measured.
      item.sellerChatId = inbound.chatId;
      await publishListing(item);
      await sendLinqReply({
        chatId: inbound.chatId,
        text: formatListingPublished(item, { webUrl: process.env.PUBLIC_WEB_URL }),
        idempotencyKey: event.event_id
      });
      return json(response, 200, { status: "published" });
    }
  }

  if (!inbound?.reply || inbound.optedOut) {
    return json(response, 200, { status: inbound?.optedOut ? "opted_out" : "processed" });
  }

  await sendLinqReply({ chatId: inbound.chatId, text: inbound.reply, idempotencyKey: event.event_id });

  if (!inbound.photo) return json(response, 200, { status: "processed" });

  // Acknowledged already; the identification is sent as a second message so a
  // slow vision call never holds the webhook response open.
  const finished = sendIdentificationResult(inbound, event.event_id);
  pendingIdentifications.add(finished);
  finished.finally(() => pendingIdentifications.delete(finished));

  return json(response, 200, { status: "identifying" });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const cors = corsHeadersFor(request.headers.origin);
  for (const [name, value] of Object.entries(cors)) response.setHeader(name, value);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    return response.end();
  }
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

    /**
     * Stripe settlement. Signature-verified, because an unverified payment
     * confirmation would let anyone take an item without paying.
     */
    if (request.method === "POST" && url.pathname === "/webhooks/stripe") {
      const rawBody = await readRawBody(request);
      const verified = await isVerifiedStripeWebhook(
        request.headers["stripe-signature"],
        rawBody,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      if (!verified) return json(response, 401, { error: "Invalid Stripe signature." });

      const event = JSON.parse(rawBody);
      if (event.type !== "checkout.session.completed") return json(response, 200, { status: "ignored" });

      const orderId = event.data?.object?.client_reference_id;
      const order = orderId ? await findOrderById(orderId) : null;
      if (!order) return json(response, 200, { status: "unknown_order" });
      if (order.status === "paid") return json(response, 200, { status: "already_paid" });

      await markOrderPaid(order.id);
      await notifyBothSidesPaid(order);
      return json(response, 200, { status: "paid" });
    }

    /**
     * Records a measured price from the pricing study.
     *
     * Terac is MCP-only, so nothing here calls it: whoever runs the study posts
     * the result back. Shared-secret protected, because it sets the price money
     * changes hands at.
     */
    const pricing = url.pathname.match(/^\/api\/listings\/([^/]+)\/price$/);
    if (request.method === "POST" && pricing) {
      const expected = process.env.PRICING_ADMIN_TOKEN;
      if (!expected) return json(response, 503, { error: "PRICING_ADMIN_TOKEN is not configured." });
      if (request.headers["x-pricing-token"] !== expected) return json(response, 401, { error: "Invalid pricing token." });

      const body = await readJson(request);
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0) return json(response, 400, { error: "Send a positive numeric price." });

      const listing = await setMeasuredPrice(pricing[1], price, {
        floorPrice: Number.isFinite(Number(body.floorPrice)) ? Number(body.floorPrice) : null,
        studyId: body.studyId ?? null
      });
      if (!listing) return json(response, 404, { error: "No listing with that id." });

      if (listing.sellerChatId) {
        try {
          await sendLinqReply({
            chatId: listing.sellerChatId,
            text: formatPriceMeasured(listing),
            idempotencyKey: `price-${listing.id}`
          });
        } catch (error) {
          console.log(JSON.stringify({ event: "linq.price_notice_failed", error: error.message }));
        }
      }

      return json(response, 200, { listing });
    }

    // Buyer-facing listing search. No auth: these are public listings.
    if (request.method === "GET" && url.pathname === "/api/listings") {
      const zip = url.searchParams.get("zip");
      const radiusMiles = Number(url.searchParams.get("radius") ?? DEFAULT_RADIUS_MILES);

      if (!zip) return json(response, 200, await queryListings({ radiusMiles }));
      try {
        const origin = await lookupZip(zip);
        return json(response, 200, await queryListings({ origin, radiusMiles }));
      } catch (error) {
        return json(response, 400, { error: error.message });
      }
    }

    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok" });
    if (request.method === "GET") return serveFile(url.pathname, response);
    return json(response, 405, { error: "Method not allowed" });
  } catch (error) {
    json(response, 500, { error: error.message || "Unexpected server error" });
  }
});

const port = Number(process.env.PORT || 3000);
await initStore();
console.log(JSON.stringify({ event: "store.ready", backend: storeBackend() }));
server.listen(port, () => console.log(`Photo identification is running at http://localhost:${server.address().port}`));
