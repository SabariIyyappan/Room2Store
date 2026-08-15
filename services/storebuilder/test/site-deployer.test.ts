import assert from "node:assert/strict";
import test from "node:test";
import { createSiteDeployer, LocalSiteDeployer, RenderStaticSiteDeployer } from "../src/site-deployer.ts";

test("B10 createSiteDeployer falls back to local without an api key+owner id", () => {
  assert.ok(createSiteDeployer(undefined, undefined) instanceof LocalSiteDeployer);
  assert.ok(createSiteDeployer("key_only", undefined) instanceof LocalSiteDeployer);
});

test("B10 createSiteDeployer picks Render once an api key and owner id are set", () => {
  assert.ok(createSiteDeployer("render_key", "own-123") instanceof RenderStaticSiteDeployer);
});

test("B10 LocalSiteDeployer is idempotent per campaign, no network dependency", async () => {
  const deployer = new LocalSiteDeployer();
  const first = await deployer.ensureSite("cmp_demo_room_001", "https://github.com/x/y");
  const second = await deployer.ensureSite("cmp_demo_room_001", "https://github.com/x/y");
  assert.equal(first.storeUrl, second.storeUrl);
  assert.match(first.storeUrl, /^https:\/\/room2store-cmp-demo-room-001\.onrender\.com$/);
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

test("B10 RenderStaticSiteDeployer creates a static_site service when none exists yet", async () => {
  let listUrl: string | undefined;
  let createBody: string | undefined;

  const result = await withMockedFetch(
    (async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        listUrl = url;
        return new Response(JSON.stringify([]), { status: 200 });
      }
      createBody = init?.body as string;
      return new Response(
        JSON.stringify({ service: { name: "room2store-cmp-3", url: "https://room2store-cmp-3.onrender.com" }, deployId: "dep_1" }),
        { status: 201 },
      );
    }) as typeof fetch,
    () => new RenderStaticSiteDeployer("render_key", "own-123").ensureSite("cmp_3", "https://github.com/room2store-demo/room2store-cmp-3"),
  );

  assert.equal(result.storeUrl, "https://room2store-cmp-3.onrender.com");
  assert.match(listUrl ?? "", /type=static_site/);
  assert.match(listUrl ?? "", /ownerId=own-123/);

  const body = JSON.parse(createBody ?? "{}");
  assert.equal(body.type, "static_site");
  assert.equal(body.repo, "https://github.com/room2store-demo/room2store-cmp-3");
  assert.equal(body.ownerId, "own-123");
  assert.equal(body.branch, "main");
});

test("B10 RenderStaticSiteDeployer reuses an existing service instead of creating a duplicate", async () => {
  let postCalled = false;
  const result = await withMockedFetch(
    (async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify([{ service: { name: "room2store-cmp-4", url: "https://room2store-cmp-4.onrender.com" }, cursor: "c1" }]), { status: 200 });
      }
      postCalled = true;
      throw new Error("must not create a duplicate service");
    }) as typeof fetch,
    () => new RenderStaticSiteDeployer("render_key", "own-123").ensureSite("cmp_4", "https://github.com/room2store-demo/room2store-cmp-4"),
  );

  assert.equal(result.storeUrl, "https://room2store-cmp-4.onrender.com");
  assert.equal(postCalled, false);
});
