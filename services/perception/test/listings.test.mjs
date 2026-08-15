import test from "node:test";
import assert from "node:assert/strict";
import { publishListing, queryListings, resetListings, setMeasuredPrice } from "../src/listings.mjs";

const SF = { zip: "94107", city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194 };
const OAKLAND = { zip: "94612", city: "Oakland", state: "CA", latitude: 37.8044, longitude: -122.2712 };
const NEW_YORK = { zip: "10001", city: "New York", state: "NY", latitude: 40.7128, longitude: -74.006 };

test.beforeEach(() => {
  resetListings();
  delete process.env.ROOM2STORE_API_BASE_URL;
});

test("a listing without a location is refused", async () => {
  await assert.rejects(
    publishListing({ name: "blue plastic chair", condition: "good" }),
    /needs a pickup location/
  );
});

test("a published listing carries no invented price", async () => {
  const listing = await publishListing({ name: "blue plastic chair", condition: "good", location: SF });
  assert.equal(listing.price, null);
  assert.equal(listing.priceStatus, "being_measured");
});

test("the measured price replaces the pending state once the study lands", async () => {
  const listing = await publishListing({ name: "blue plastic chair", condition: "good", location: SF });
  const priced = setMeasuredPrice(listing.id, 45);
  assert.equal(priced.price, 45);
  assert.equal(priced.priceStatus, "measured");
});

test("the radius filter keeps what is near and drops what is far", async () => {
  await publishListing({ name: "oakland chair", condition: "good", location: OAKLAND });
  await publishListing({ name: "new york lamp", condition: "fair", location: NEW_YORK });

  const { listings } = queryListings({ origin: SF, radiusMiles: 20 });
  assert.equal(listings.length, 1);
  assert.equal(listings[0].name, "oakland chair");
});

test("a wider radius reaches further", async () => {
  await publishListing({ name: "oakland chair", condition: "good", location: OAKLAND });
  await publishListing({ name: "new york lamp", condition: "fair", location: NEW_YORK });

  assert.equal(queryListings({ origin: SF, radiusMiles: 100 }).listings.length, 1, "New York is well beyond 100 miles");
  assert.equal(queryListings({ origin: SF, radiusMiles: 10 }).listings.length, 1, "Oakland is inside 10 miles");
});

test("results are nearest first and carry their distance", async () => {
  await publishListing({ name: "far", condition: "good", location: OAKLAND });
  await publishListing({ name: "near", condition: "good", location: SF });

  const { listings } = queryListings({ origin: SF, radiusMiles: 50 });
  assert.deepEqual(listings.map((listing) => listing.name), ["near", "far"]);
  assert.equal(listings[0].distanceMiles, 0);
  assert.ok(listings[1].distanceMiles > 5);
});

test("the radius is clamped, so a hand-typed query cannot widen it past the slider", async () => {
  await publishListing({ name: "new york lamp", condition: "fair", location: NEW_YORK });
  const result = queryListings({ origin: SF, radiusMiles: 99_999 });
  assert.equal(result.radiusMiles, 100);
  assert.equal(result.listings.length, 0);
});

test("no origin returns everything, so the site works before a buyer types a ZIP", async () => {
  await publishListing({ name: "oakland chair", condition: "good", location: OAKLAND });
  await publishListing({ name: "new york lamp", condition: "fair", location: NEW_YORK });
  assert.equal(queryListings({}).listings.length, 2);
});

test("a failed write-through to the API still publishes locally", async () => {
  process.env.ROOM2STORE_API_BASE_URL = "http://127.0.0.1:1";
  process.env.ROOM2STORE_CAMPAIGN_ID = "campaign-1";

  const listing = await publishListing(
    { name: "blue plastic chair", condition: "good", location: SF },
    { fetchImpl: async () => ({ ok: false, status: 500 }) }
  );

  assert.equal(queryListings({}).listings.length, 1, "the seller was told it is live, so it must be live locally");
  assert.equal(listing.name, "blue plastic chair");
});
