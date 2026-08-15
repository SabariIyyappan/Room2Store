import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureItems } from "@room2store/contracts/fixtures";
import { renderStorefront } from "../src/render-template.ts";

test("B10 renderStorefront fills the campaign title, item count, and one card per item", async () => {
  const { files } = await renderStorefront(fixtureCampaign, fixtureItems);

  assert.match(files["index.html"]!, /Mission District Moveout/);
  assert.match(files["index.html"]!, /3 items/);
  assert.equal((files["index.html"]!.match(/class="item-card"/g) ?? []).length, 3);
  assert.doesNotMatch(files["index.html"]!, /\{\{/, "no unfilled tokens should remain");
  assert.ok(files["style.css"]!.includes("--accent"));
});

test("B10 renderStorefront prefers listingV2 over listingV1 over raw item fields, and formats price", async () => {
  const withV2 = { ...fixtureItems[0]!, listingV2: { title: "Chair (rewritten)", description: "Now with height stated.", photoUrls: ["https://example.test/v2.jpg"], publicCopy: "" }, measuredPrice: 32 };
  const { files } = await renderStorefront(fixtureCampaign, [withV2]);
  assert.match(files["index.html"]!, /Chair \(rewritten\)/);
  assert.match(files["index.html"]!, /\$32/);
  assert.match(files["index.html"]!, /v2\.jpg/);

  const noListingNoPrice = { ...fixtureItems[1]!, listingV1: undefined, naivePrice: undefined };
  const rendered = await renderStorefront(fixtureCampaign, [noListingNoPrice]);
  assert.match(rendered.files["index.html"]!, /Price coming soon/);
});

test("B10 renderStorefront escapes HTML in item copy", async () => {
  const dangerous = { ...fixtureItems[0]!, listingV1: { title: '<script>alert("x")</script>', description: "ok", photoUrls: [], publicCopy: "" } };
  const { files } = await renderStorefront(fixtureCampaign, [dangerous]);
  assert.doesNotMatch(files["index.html"]!, /<script>/);
  assert.match(files["index.html"]!, /&lt;script&gt;/);
});
