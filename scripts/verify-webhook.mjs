/**
 * Proves the deployed endpoint accepts a correctly signed webhook.
 *
 * Usage: npm run linq:verify -- https://room2store-perception.onrender.com
 *
 * Sends a signed STOP event, which is the one path that answers 200 without
 * sending an outbound message, so it costs nothing and touches no real chat.
 * Reads LINQ_WEBHOOK_SECRET from .env; the secret is never printed.
 */

import { createHmac } from "node:crypto";

const baseUrl = process.argv[2];
if (!baseUrl?.startsWith("https://")) {
  console.error("Pass the https base URL, e.g. npm run linq:verify -- https://room2store-perception.onrender.com");
  process.exit(1);
}

const secret = process.env.LINQ_WEBHOOK_SECRET;
if (!secret || secret === "pending") {
  console.error("LINQ_WEBHOOK_SECRET is not set in .env. Paste the whsec_ value from the Linq dashboard.");
  process.exit(1);
}
if (!secret.startsWith("whsec_")) {
  console.error("That does not look like a Linq signing secret; it should start with whsec_.");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/+$/, "")}/webhooks/linq`;
const body = JSON.stringify({
  event_id: `verify-${process.pid}`,
  event_type: "message.received",
  data: { chat: { id: "verification-probe" }, parts: [{ type: "text", value: "STOP" }] }
});

const id = `msg_verify_${process.pid}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
  .update(`${id}.${timestamp}.${body}`)
  .digest("base64");

console.log(`Waking ${baseUrl} (free tier cold start can take ~50s)...`);
const health = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(90_000) }).catch(() => null);
console.log(health?.ok ? "Service is awake." : "Health check did not answer; continuing anyway.");

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`
  },
  body,
  signal: AbortSignal.timeout(90_000)
});

const text = await response.text();
console.log(`\nHTTP ${response.status}: ${text}`);

if (response.status === 401) {
  console.error("\nFAILED: the service rejected a correctly signed payload. The secret in Render does not match the one in .env, or the redeploy has not finished.");
  process.exit(1);
}
if (response.status === 200 && text.includes("opted_out")) {
  console.log("\nPASSED: signature verified, opt-out honoured, no outbound message sent. Ready for a real inbound test.");
  process.exit(0);
}
console.error("\nUNEXPECTED: verification passed but the response is not the expected opt_out. Check the Render logs.");
process.exit(1);
