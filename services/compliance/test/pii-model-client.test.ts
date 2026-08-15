import assert from "node:assert/strict";
import test from "node:test";
import { createPiiModelClient, LocalPiiModelClient, PioneerPiiClient } from "../src/pii-model-client.ts";

test("B7 LocalPiiModelClient scrubs text without any network dependency", async () => {
  const client = new LocalPiiModelClient();
  const outcome = await client.scrub("Text me at 415-555-0134.");
  assert.equal(outcome.scrubbed, "Text me at [REDACTED:PHONE].");
  assert.equal(outcome.findings[0]?.type, "phone");
});

test("B7 createPiiModelClient falls back to local when no Pioneer API key is set", () => {
  const client = createPiiModelClient(undefined, undefined);
  assert.ok(client instanceof LocalPiiModelClient);
});

test("B7 createPiiModelClient falls back to local even with a base URL but no key", () => {
  assert.ok(createPiiModelClient("https://api.pioneer.ai/v1", undefined) instanceof LocalPiiModelClient);
});

test("B7 createPiiModelClient picks the live Pioneer client once an API key is set", () => {
  const client = createPiiModelClient(undefined, "pioneer_test_key");
  assert.ok(client instanceof PioneerPiiClient);
});

async function withMockedFetch<T>(handler: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("B7 PioneerPiiClient calls the documented GLiNER2-PII request shape and redacts from returned spans", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  const outcome = await withMockedFetch(
    (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  entities: [{ type: "email", text: "buyer@example.com", start: 6, end: 23 }],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch,
    () => new PioneerPiiClient("https://api.pioneer.ai/v1", "pioneer_test_key").scrub("Email buyer@example.com now."),
  );

  assert.equal(capturedUrl, "https://api.pioneer.ai/v1/chat/completions");
  const body = JSON.parse((capturedInit?.body as string) ?? "{}");
  assert.equal(body.model, "fastino/gliner2-privacy-filter-PII-multi");
  assert.equal(body.messages[0].content, "Email buyer@example.com now.");
  assert.ok(body.schema.entities.includes("email"));
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer pioneer_test_key");

  assert.equal(outcome.scrubbed, "Email [REDACTED:EMAIL] now.");
  assert.equal(outcome.findings[0]?.type, "email");
});

test("B7 PioneerPiiClient falls back to the local scrubber on a non-2xx response", async () => {
  const outcome = await withMockedFetch(
    (async () => new Response("server error", { status: 500 })) as typeof fetch,
    () => new PioneerPiiClient("https://api.pioneer.ai/v1", "pioneer_test_key").scrub("Call 415-555-0134."),
  );
  assert.equal(outcome.scrubbed, "Call [REDACTED:PHONE].");
});

test("B7 PioneerPiiClient falls back to the local scrubber rather than ship unredacted text on an unrecognized entity type", async () => {
  const outcome = await withMockedFetch(
    (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ entities: [{ type: "api_key", text: "sk_live_xyz", start: 0, end: 11 }] }) } }],
        }),
        { status: 200 },
      )) as typeof fetch,
    () => new PioneerPiiClient("https://api.pioneer.ai/v1", "pioneer_test_key").scrub("Call 415-555-0134."),
  );
  // api_key isn't one of our five mapped types, so the response is treated as unrecognized
  // and the local scrubber runs instead of shipping the phone number unredacted.
  assert.equal(outcome.scrubbed, "Call [REDACTED:PHONE].");
});
