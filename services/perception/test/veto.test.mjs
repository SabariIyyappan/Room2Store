import test from "node:test";
import assert from "node:assert/strict";
import { recordItem, resetSessions, setCondition, setLocation, startTurn } from "../src/sessions.mjs";
import { formatListingVetoed } from "../src/linq.mjs";
import { canDeploy, reviewItem } from "../../compliance/src/verdict.mjs";

const NOW = 1_770_000_000_000;
const SF = { zip: "94107", city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194 };

test.beforeEach(() => resetSessions());

function itemNamed(name) {
  startTurn("chat-1", NOW);
  recordItem("chat-1", { name, category: "baby" }, NOW);
  setCondition("chat-1", "good");
  return setLocation("chat-1", SF);
}

test("a car seat is vetoed before it can be published", () => {
  const item = itemNamed("Graco infant car seat");
  const verdict = reviewItem({ item, listingCopy: `${item.name} ${item.condition}` });

  assert.equal(canDeploy(verdict), false);
  assert.ok(verdict.rulesTriggered.includes("prohibited_car_seat"));
});

test("the veto message names the reason rather than just refusing", () => {
  const item = itemNamed("Graco infant car seat");
  const verdict = reviewItem({ item, listingCopy: item.name });
  const message = formatListingVetoed(item, verdict);

  assert.match(message, /I cannot list the Graco infant car seat\./);
  assert.match(message, /used car seats and booster seats cannot be resold safely/);
  assert.match(message, /Send a photo of something else/);
});

test("an ordinary item still clears the gate", () => {
  const item = itemNamed("blue plastic stacking chair");
  const verdict = reviewItem({ item, listingCopy: `${item.name} ${item.condition}` });
  assert.equal(canDeploy(verdict), true);
});
