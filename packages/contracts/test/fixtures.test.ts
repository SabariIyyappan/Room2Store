import assert from "node:assert/strict";
import test from "node:test";
import {
  fixtureApproveVerdict,
  fixtureCampaign,
  fixtureItems,
  fixtureTeracResponses,
  fixtureVetoVerdict,
} from "../src/fixtures/index.ts";

test("fixtures supply the shared C0 demo data", () => {
  assert.equal(fixtureCampaign.id, "cmp_demo_room_001");
  assert.deepEqual(fixtureItems.map((item) => item.category), ["furniture", "electronics", "lighting"]);
  assert.equal(fixtureTeracResponses.length, 50);
  assert.equal(fixtureApproveVerdict.decision, "approve");
  assert.equal(fixtureVetoVerdict.decision, "veto");
});
