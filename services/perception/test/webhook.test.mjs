import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const SECRET_BASE64 = Buffer.from("room2store-test-secret").toString("base64");
const WEBHOOK_SECRET = `whsec_${SECRET_BASE64}`;
const PIXEL = Buffer.from("/9j/4AAQSkZJRg==", "base64");

function sign(body) {
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(SECRET_BASE64, "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` };
}

/** Stands in for both the Linq API and the Pioneer vision API. */
async function startStub(state) {
  const stub = createServer(async (request, response) => {
    if (request.url.startsWith("/media/")) {
      response.writeHead(200, { "content-type": "image/jpeg" });
      return response.end(PIXEL);
    }

    // Stands in for the public ZIP geocoder.
    if (request.url.startsWith("/zip/")) {
      const zip = request.url.slice("/zip/".length);
      const places = {
        "94107": { latitude: "37.7749", longitude: "-122.4194", "place name": "San Francisco", "state abbreviation": "CA" },
        "94612": { latitude: "37.8044", longitude: "-122.2712", "place name": "Oakland", "state abbreviation": "CA" },
        "10001": { latitude: "40.7128", longitude: "-74.0060", "place name": "New York", "state abbreviation": "NY" }
      };
      if (!places[zip]) {
        response.writeHead(404, { "content-type": "application/json" });
        return response.end("{}");
      }
      response.writeHead(200, { "content-type": "application/json" });
      return response.end(JSON.stringify({ "post code": zip, places: [places[zip]] }));
    }

    let body = "";
    for await (const chunk of request) body += chunk;

    if (request.url === "/v1/chat/completions") {
      state.visionCalls.push(JSON.parse(body).model);
      response.writeHead(200, { "content-type": "application/json" });
      return response.end(JSON.stringify({
        choices: [{
          message: {
            role: "assistant",
            content: '{"product_name":"WH-1000XM5","brand":"Sony","category":"electronics","model_number":"WH-1000XM5","confidence":0.93}'
          }
        }]
      }));
    }

    state.replies.push(JSON.parse(body || "{}").message?.parts?.[0]?.value ?? "");
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });

  await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
  return { stub, port: stub.address().port };
}

async function startService(stubPort) {
  const entry = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: "0",
      LINQ_WEBHOOK_SECRET: WEBHOOK_SECRET,
      LINQ_API_KEY: "linq_test_key",
      LINQ_API_URL: `http://127.0.0.1:${stubPort}/v3`,
      PIONEER_API_KEY: "pio_sk_test",
      PIONEER_BASE_URL: `http://127.0.0.1:${stubPort}/v1`,
      ZIP_API_URL: `http://127.0.0.1:${stubPort}/zip`,
      PRICING_ADMIN_TOKEN: "test-pricing-token"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const port = await new Promise((resolve, reject) => {
    let buffered = "";
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      const match = buffered.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => reject(new Error(String(chunk))));
    child.on("exit", (code) => reject(new Error(`Service exited early with code ${code}.`)));
  });

  return { child, port };
}

/** Polls until the predicate returns something truthy; the result message arrives out of band. */
async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = predicate();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the follow-up message.");
}

function postWebhook(port, event, headers) {
  const body = JSON.stringify(event);
  return fetch(`http://127.0.0.1:${port}/webhooks/linq`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers ?? sign(body)) },
    body
  });
}

const textEvent = (id) => ({
  event_id: id,
  event_type: "message.received",
  data: { chat: { id: "chat-1" }, parts: [{ type: "text", value: "Hi" }] }
});

test("Linq webhook end to end", async (t) => {
  const state = { replies: [], visionCalls: [] };
  const { stub, port: stubPort } = await startStub(state);
  const { child, port } = await startService(stubPort);
  t.after(() => {
    child.kill();
    stub.close();
  });

  await t.test("boots and answers the health check", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  await t.test("rejects an unsigned payload", async () => {
    const response = await postWebhook(port, textEvent("evt-unsigned"), { "content-type": "application/json" });
    assert.equal(response.status, 401);
    assert.equal(state.replies.length, 0);
  });

  await t.test("replies to a verified inbound text", async () => {
    const response = await postWebhook(port, textEvent("evt-1"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "processed" });
    assert.match(state.replies.at(-1), /Welcome to Room2Store/);
  });

  await t.test("deduplicates a replayed event", async () => {
    const before = state.replies.length;
    const response = await postWebhook(port, textEvent("evt-1"));
    assert.deepEqual(await response.json(), { status: "duplicate" });
    assert.equal(state.replies.length, before);
  });

  await t.test("acknowledges a photo immediately, then sends the identification", async () => {
    const response = await postWebhook(port, {
      event_id: "evt-photo",
      event_type: "message.received",
      data: {
        chat: { id: "chat-1" },
        // Real payloads carry no mime_type; the type comes from the download.
        parts: [{ type: "media", url: `http://127.0.0.1:${stubPort}/media/item.jpg` }]
      }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "identifying" });

    // The acknowledgement is already sent by the time the webhook answers.
    assert.match(state.replies.at(-1), /Got it — looking at your photo now\./);

    const result = await waitFor(() => state.replies.find((reply) => reply.includes("Looks like a used")));
    assert.match(result, /Looks like a used Sony WH-1000XM5\./);
    assert.match(result, /Model number on it: WH-1000XM5/);
    assert.match(result, /What condition is it in/);
    assert.deepEqual(state.visionCalls, ["google/gemini-3.1-flash-lite"]);
  });

  await t.test("answering the condition asks where the item is", async () => {
    const response = await postWebhook(port, {
      event_id: "evt-condition",
      event_type: "message.received",
      data: { chat: { id: "chat-1" }, parts: [{ type: "text", value: "good" }] }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "awaiting_location" });
    assert.match(state.replies.at(-1), /What ZIP code is it in for pickup/);
  });

  await t.test("answering with a ZIP publishes the listing", async () => {
    const response = await postWebhook(port, {
      event_id: "evt-zip",
      event_type: "message.received",
      data: { chat: { id: "chat-1" }, parts: [{ type: "text", value: "94107" }] }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "published" });

    const published = state.replies.at(-1);
    assert.match(published, /Your listing is live:/);
    assert.match(published, /Sony WH-1000XM5/);
    assert.match(published, /Pickup: San Francisco, CA/);
    assert.match(published, /Price: being measured now/);
  });

  await t.test("the published listing is findable inside the radius and not outside it", async () => {
    const near = await fetch(`http://127.0.0.1:${port}/api/listings?zip=94612&radius=20`);
    const nearBody = await near.json();
    assert.equal(nearBody.listings.length, 1, "Oakland is about 8 miles from the listing");
    assert.ok(nearBody.listings[0].distanceMiles < 20);

    const far = await fetch(`http://127.0.0.1:${port}/api/listings?zip=10001&radius=100`);
    assert.equal((await far.json()).listings.length, 0, "New York is far outside 100 miles");
  });

  await t.test("a measured price needs the shared token", async () => {
    const { listings } = await (await fetch(`http://127.0.0.1:${port}/api/listings`)).json();
    const id = listings[0].id;

    const unauthorised = await fetch(`http://127.0.0.1:${port}/api/listings/${id}/price`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ price: 45 })
    });
    assert.equal(unauthorised.status, 401);
  });

  await t.test("posting a measured price prices the listing and texts the seller", async () => {
    const { listings } = await (await fetch(`http://127.0.0.1:${port}/api/listings`)).json();
    const id = listings[0].id;

    const response = await fetch(`http://127.0.0.1:${port}/api/listings/${id}/price`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-pricing-token": "test-pricing-token" },
      body: JSON.stringify({ price: 145, floorPrice: 118, studyId: "study-1" })
    });
    assert.equal(response.status, 200);

    const { listing } = await response.json();
    assert.equal(listing.price, 145);
    assert.equal(listing.priceStatus, "measured");

    const notice = state.replies.at(-1);
    assert.match(notice, /Your price is in/);
    assert.match(notice, /Price: \$145/);
    assert.match(notice, /not accept below \$118/);
  });

  await t.test("an unknown ZIP is rejected rather than guessed", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/listings?zip=00000`);
    assert.equal(response.status, 400);
  });

  await t.test("lists the photographed item back when the seller replies 1", async () => {
    const response = await postWebhook(port, {
      event_id: "evt-list",
      event_type: "message.received",
      data: { chat: { id: "chat-1" }, parts: [{ type: "text", value: "1" }] }
    });
    assert.equal(response.status, 200);
    assert.match(state.replies.at(-1), /1\. Sony WH-1000XM5 \(WH-1000XM5\)/);
  });

  await t.test("stays silent after an opt-out", async () => {
    const before = state.replies.length;
    const response = await postWebhook(port, {
      event_id: "evt-stop",
      event_type: "message.received",
      data: { chat: { id: "chat-1" }, parts: [{ type: "text", value: "STOP" }] }
    });
    assert.deepEqual(await response.json(), { status: "opted_out" });
    assert.equal(state.replies.length, before);
  });
});
