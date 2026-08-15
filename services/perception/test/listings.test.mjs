import test from "node:test";
import assert from "node:assert/strict";
import { publishListing, queryListings, setMeasuredPrice } from "../src/listings.mjs";
import { findListingByCode, resetStore } from "../src/store.mjs";

const SF = { zip: "94107", city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194 };
const OAKLAND = { zip: "94612", city: "Oakland", state: "CA", latitude: 37.8044, longitude: -122.2712 };
const NEW_YORK = { zip: "10001", city: "New York", state: "NY", latitude: 40.7128, longitude: -74.006 };

const item = (name, location, extra = {}) => ({
  name,
  condition: "good",
  location,
  sellerChatId: `chat-${name}`,
  ...extra
});

test.beforeEach(() => resetStore());

test("a listing without a location is refused", async () => {
  await assert.rejects(publishListing({ name: "blue plastic chair", condition: "good" }), /needs a pickup location/);
});

test("a published listing carries no invented price", async () => {
  const listing = await publishListing(item("blue plastic chair", SF));
  assert.equal(listing.price, null);
  assert.equal(listing.priceStatus, "being_measured");
});

test("every listing gets a code a buyer can type into a text message", async () => {
  const listing = await publishListing(item("blue plastic chair", SF));
  assert.match(listing.code, /^R2S-[A-Z0-9]{4}$/);
  assert.equal((await findListingByCode(listing.code)).id, listing.id);
  assert.equal((await findListingByCode(listing.code.toLowerCase())).id, listing.id, "codes are typed by hand, so case cannot matter");
});

test("the measured price and floor replace the pending state", async () => {
  const listing = await publishListing(item("blue plastic chair", SF));
  const priced = await setMeasuredPrice(listing.id, 145, { floorPrice: 118, studyId: "study-1" });

  assert.equal(priced.price, 145);
  assert.equal(priced.floorPrice, 118);
  assert.equal(priced.priceStatus, "measured");
});

test("without an explicit floor the measured price is the floor", async () => {
  const listing = await publishListing(item("blue plastic chair", SF));
  const priced = await setMeasuredPrice(listing.id, 60);
  assert.equal(priced.floorPrice, 60, "no floor must never mean no bottom");
});

test("the radius filter keeps what is near and drops what is far", async () => {
  await publishListing(item("oakland chair", OAKLAND));
  await publishListing(item("new york lamp", NEW_YORK));

  const { listings } = await queryListings({ origin: SF, radiusMiles: 20 });
  assert.equal(listings.length, 1);
  assert.equal(listings[0].name, "oakland chair");
});

test("results are nearest first and carry their distance", async () => {
  await publishListing(item("far", OAKLAND));
  await publishListing(item("near", SF));

  const { listings } = await queryListings({ origin: SF, radiusMiles: 50 });
  assert.deepEqual(listings.map((listing) => listing.name), ["near", "far"]);
  assert.equal(listings[0].distanceMiles, 0);
  assert.ok(listings[1].distanceMiles > 5);
});

test("the radius is clamped, so a hand-typed query cannot widen it past the slider", async () => {
  await publishListing(item("new york lamp", NEW_YORK));
  const result = await queryListings({ origin: SF, radiusMiles: 99_999 });
  assert.equal(result.radiusMiles, 100);
  assert.equal(result.listings.length, 0);
});

test("no origin returns everything, so the site works before a buyer types a ZIP", async () => {
  await publishListing(item("oakland chair", OAKLAND));
  await publishListing(item("new york lamp", NEW_YORK));
  assert.equal((await queryListings({})).listings.length, 2);
});

test("MODEL_UNKNOWN never reaches a listing as a model number", async () => {
  const listing = await publishListing(item("lamp", SF, { modelNumber: "MODEL_UNKNOWN" }));
  assert.equal(listing.modelNumber, null);
});
