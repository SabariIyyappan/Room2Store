import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureItems } from "@room2store/contracts/fixtures";
import { buildStorefront } from "../src/build-storefront.ts";
import { LocalRepoPublisher } from "../src/github-publisher.ts";
import { LocalSiteDeployer } from "../src/site-deployer.ts";

test("B10 buildStorefront renders, publishes, and deploys end to end against the local fallbacks", async () => {
  const publisher = new LocalRepoPublisher();
  const deployer = new LocalSiteDeployer();

  const deploy = await buildStorefront(fixtureCampaign, fixtureItems, { publisher, deployer });

  assert.match(deploy.repoUrl, /room2store-cmp-demo-room-001/);
  assert.match(deploy.storeUrl, /^https:\/\/room2store-cmp-demo-room-001\.onrender\.com$/);

  const published = publisher.publishedFiles.get("room2store-cmp-demo-room-001");
  assert.ok(published?.["index.html"]?.includes("Mission District Moveout"));
  assert.ok(published?.["style.css"]);
});

test("B10 buildStorefront is idempotent — rebuilding the same campaign reuses the same deployed URL", async () => {
  const publisher = new LocalRepoPublisher();
  const deployer = new LocalSiteDeployer();
  const first = await buildStorefront(fixtureCampaign, fixtureItems, { publisher, deployer });
  const second = await buildStorefront(fixtureCampaign, [...fixtureItems, fixtureItems[0]!], { publisher, deployer });
  assert.equal(first.storeUrl, second.storeUrl);
});
