/**
 * Diagnoses a Pioneer 403 by trying each plausible auth header and endpoint
 * shape and printing the status and body of every attempt.
 *
 * Usage: npm run pioneer:probe
 *
 * The key itself is never printed, only its prefix and length.
 */

const key = process.env.PIONEER_API_KEY;
if (!key || key === "pending") {
  console.error("PIONEER_API_KEY is not set in .env.");
  process.exit(1);
}

console.log(`Key looks like: ${key.slice(0, 7)}... (${key.length} characters)`);
if (!key.startsWith("pio_sk_")) console.log("WARNING: expected the key to start with pio_sk_");

const IMAGE =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

const anthropicBody = (model) => ({
  model,
  max_tokens: 64,
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: IMAGE } },
      { type: "text", text: "Reply with the single word OK." }
    ]
  }]
});

const openaiBody = (model) => ({
  model,
  max_tokens: 64,
  messages: [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${IMAGE}` } },
      { type: "text", text: "Reply with the single word OK." }
    ]
  }]
});

const attempts = [
  { label: "anthropic /v1/messages + x-api-key", url: "https://api.pioneer.ai/v1/messages", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, body: anthropicBody("claude-haiku-4-5") },
  { label: "anthropic /v1/messages + X-API-Key (no version)", url: "https://api.pioneer.ai/v1/messages", headers: { "X-API-Key": key }, body: anthropicBody("claude-haiku-4-5") },
  { label: "anthropic /v1/messages + Bearer", url: "https://api.pioneer.ai/v1/messages", headers: { authorization: `Bearer ${key}`, "anthropic-version": "2023-06-01" }, body: anthropicBody("claude-haiku-4-5") },
  { label: "openai /v1/chat/completions + Bearer", url: "https://api.pioneer.ai/v1/chat/completions", headers: { authorization: `Bearer ${key}` }, body: openaiBody("claude-haiku-4-5") },
  { label: "openai /v1/chat/completions + x-api-key", url: "https://api.pioneer.ai/v1/chat/completions", headers: { "x-api-key": key }, body: openaiBody("claude-haiku-4-5") },
  { label: "text-only (is it the image that is refused?)", url: "https://api.pioneer.ai/v1/messages", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, body: { model: "claude-haiku-4-5", max_tokens: 16, messages: [{ role: "user", content: "Reply with the single word OK." }] } },
  // The docs' one authoritative call: what can this key actually reach?
  { label: "BASE MODEL LIST (the important one)", url: "https://api.pioneer.ai/base-models", headers: { "X-API-Key": key }, method: "GET" },
  { label: "openai-style model list", url: "https://api.pioneer.ai/v1/models", headers: { "X-API-Key": key }, method: "GET" }
];

for (const attempt of attempts) {
  try {
    const response = await fetch(attempt.url, {
      method: attempt.method ?? "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json", ...attempt.headers },
      ...(attempt.method === "GET" ? {} : { body: JSON.stringify(attempt.body) })
    });
    const limit = attempt.method === "GET" ? 2_000 : 300;
    const text = (await response.text()).slice(0, limit).replace(/\s+/g, " ").trim();
    console.log(`\n[${response.status}] ${attempt.label}\n    ${text}`);
    if (response.ok) console.log("    ^ THIS ONE WORKS");
  } catch (error) {
    console.log(`\n[network] ${attempt.label}\n    ${error.message}`);
  }
}
