/**
 * Creates the Linq message.received subscription and stores the returned
 * signing secret in .env.
 *
 * Usage: npm run linq:subscribe -- https://your-service.onrender.com
 *
 * The secret is written straight to .env and never printed, so it stays out of
 * the terminal, the task board, and git.
 */

import { appendFile, readFile } from "node:fs/promises";

const LINQ_API_URL = process.env.LINQ_API_URL || "https://api.linqapp.com/api/partner/v3";
const PAYLOAD_VERSION = "2026-02-03";
const ENV_PATH = new URL("../.env", import.meta.url);

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Pass the public base URL, e.g. npm run linq:subscribe -- https://room2store.onrender.com");
  process.exit(1);
}
if (!baseUrl.startsWith("https://")) {
  console.error("The target URL must be https.");
  process.exit(1);
}
if (!process.env.LINQ_API_KEY) {
  console.error("LINQ_API_KEY is not set. Put it in .env first.");
  process.exit(1);
}

const targetUrl = `${baseUrl.replace(/\/+$/, "")}/webhooks/linq?version=${PAYLOAD_VERSION}`;

const health = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`).catch(() => null);
if (!health?.ok) {
  console.error(`${baseUrl} is not answering /health yet. Deploy it before subscribing.`);
  process.exit(1);
}
console.log(`Health check passed for ${baseUrl}`);

const response = await fetch(`${LINQ_API_URL}/webhook-subscriptions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.LINQ_API_KEY}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({ target_url: targetUrl, subscribed_events: ["message.received"] })
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Subscription failed with status ${response.status}: ${JSON.stringify(body)}`);
  process.exit(1);
}

const secret = body.secret ?? body.signing_secret ?? body.data?.secret;
console.log(`Subscribed ${targetUrl} to message.received`);
console.log(`Subscription id: ${body.id ?? body.data?.id ?? "(not returned)"}`);

if (!secret) {
  console.error("No signing secret came back. Copy it from the Linq dashboard into LINQ_WEBHOOK_SECRET yourself.");
  process.exit(1);
}

const existing = await readFile(ENV_PATH, "utf8").catch(() => "");
if (existing.includes("LINQ_WEBHOOK_SECRET=") && !/LINQ_WEBHOOK_SECRET=\s*$/m.test(existing)) {
  console.log("LINQ_WEBHOOK_SECRET already has a value in .env; leaving it alone. Replace it by hand if this is a new subscription.");
  process.exit(0);
}

await appendFile(ENV_PATH, `${existing.endsWith("\n") || existing === "" ? "" : "\n"}LINQ_WEBHOOK_SECRET=${secret}\n`);
console.log(`Signing secret written to .env (${secret.length} characters). Paste the same value into Render as LINQ_WEBHOOK_SECRET.`);
