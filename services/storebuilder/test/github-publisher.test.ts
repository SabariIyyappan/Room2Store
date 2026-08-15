import assert from "node:assert/strict";
import test from "node:test";
import { createRepoPublisher, GitHubRepoPublisher, LocalRepoPublisher } from "../src/github-publisher.ts";

test("B10 createRepoPublisher falls back to local without a token+owner", () => {
  assert.ok(createRepoPublisher(undefined, undefined) instanceof LocalRepoPublisher);
  assert.ok(createRepoPublisher("token_only", undefined) instanceof LocalRepoPublisher);
});

test("B10 createRepoPublisher picks GitHub once a token and owner are set", () => {
  assert.ok(createRepoPublisher("gh_token", "room2store-demo") instanceof GitHubRepoPublisher);
});

test("B10 LocalRepoPublisher records published files without any network dependency", async () => {
  const publisher = new LocalRepoPublisher();
  const { repoUrl } = await publisher.publish("cmp_demo_room_001", { "index.html": "<html></html>" });
  assert.match(repoUrl, /room2store-cmp-demo-room-001/);
  assert.equal(publisher.publishedFiles.get("room2store-cmp-demo-room-001")?.["index.html"], "<html></html>");
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

test("B10 GitHubRepoPublisher creates the repo when it doesn't exist, then writes each file", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];

  const outcome = await withMockedFetch(
    (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (url.endsWith("/repos/room2store-demo/room2store-cmp-1") && (init?.method ?? "GET") === "GET") {
        return new Response("not found", { status: 404 });
      }
      if (url === "https://api.github.com/user/repos") {
        return new Response(JSON.stringify({ full_name: "room2store-demo/room2store-cmp-1" }), { status: 201 });
      }
      if (url.includes("/contents/") && (init?.method ?? "GET") === "GET") {
        return new Response("not found", { status: 404 }); // no existing file -> pure create, no sha
      }
      if (url.includes("/contents/") && init?.method === "PUT") {
        return new Response(JSON.stringify({ content: { sha: "abc123" } }), { status: 201 });
      }
      throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
    }) as typeof fetch,
    () => new GitHubRepoPublisher("gh_test_token", "room2store-demo").publish("cmp_1", { "index.html": "<html>hi</html>", "style.css": "body{}" }),
  );

  assert.equal(outcome.repoUrl, "https://github.com/room2store-demo/room2store-cmp-1");

  const createRepoCall = calls.find((call) => call.url === "https://api.github.com/user/repos");
  assert.equal(createRepoCall?.method, "POST");
  const createBody = JSON.parse(createRepoCall?.body ?? "{}");
  assert.equal(createBody.name, "room2store-cmp-1");
  assert.equal(createBody.auto_init, true);

  const putCalls = calls.filter((call) => call.method === "PUT");
  assert.equal(putCalls.length, 2);
  const indexPut = putCalls.find((call) => call.url.endsWith("/contents/index.html"));
  const putBody = JSON.parse(indexPut?.body ?? "{}");
  assert.equal(putBody.content, Buffer.from("<html>hi</html>", "utf8").toString("base64"));
  assert.equal(putBody.sha, undefined, "a brand-new file must not send a sha");
});

test("B10 GitHubRepoPublisher reuses the existing repo and sends the current sha when updating a file", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];

  await withMockedFetch(
    (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (url.endsWith("/repos/room2store-demo/room2store-cmp-2") && (init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ full_name: "room2store-demo/room2store-cmp-2" }), { status: 200 });
      }
      if (url.includes("/contents/index.html") && (init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ sha: "existing-sha" }), { status: 200 });
      }
      if (url.includes("/contents/index.html") && init?.method === "PUT") {
        return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 200 });
      }
      throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
    }) as typeof fetch,
    () => new GitHubRepoPublisher("gh_test_token", "room2store-demo").publish("cmp_2", { "index.html": "<html>updated</html>" }),
  );

  assert.equal(calls.some((call) => call.url === "https://api.github.com/user/repos"), false, "an existing repo must not be recreated");
  const put = calls.find((call) => call.method === "PUT");
  const putBody = JSON.parse(put?.body ?? "{}");
  assert.equal(putBody.sha, "existing-sha");
  assert.match(putBody.message, /Update index\.html/);
});
