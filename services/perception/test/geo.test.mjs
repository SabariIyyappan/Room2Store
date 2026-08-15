import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RADIUS_MILES,
  MAX_RADIUS_MILES,
  MIN_RADIUS_MILES,
  clampRadius,
  distanceMiles,
  isZipCode,
  lookupZip,
  normalizeZip,
  resetZipCache
} from "../src/geo.mjs";

const SF = { latitude: 37.7749, longitude: -122.4194 };
const OAKLAND = { latitude: 37.8044, longitude: -122.2712 };
const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };

function zipResponse(zip, latitude, longitude, city = "San Francisco", state = "CA") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      "post code": zip,
      places: [{ latitude: String(latitude), longitude: String(longitude), "place name": city, "state abbreviation": state }]
    })
  };
}

test.beforeEach(() => resetZipCache());

test("recognises five-digit and plus-four ZIPs, rejects everything else", () => {
  assert.equal(isZipCode("94107"), true);
  assert.equal(isZipCode("94107-1234"), true);
  assert.equal(isZipCode("9410"), false);
  assert.equal(isZipCode("good"), false);
  assert.equal(normalizeZip("94107-1234"), "94107");
});

test("resolves a ZIP to coordinates and a place name", async () => {
  const resolved = await lookupZip("94107", { fetchImpl: async () => zipResponse("94107", 37.7749, -122.4194) });
  assert.equal(resolved.zip, "94107");
  assert.equal(resolved.city, "San Francisco");
  assert.equal(resolved.state, "CA");
  assert.equal(resolved.latitude, 37.7749);
});

test("a resolved ZIP is cached, so the same lookup does not hit the network twice", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return zipResponse("94107", 37.7749, -122.4194);
  };

  await lookupZip("94107", { fetchImpl });
  await lookupZip("94107", { fetchImpl });
  assert.equal(calls, 1);
});

test("an unknown ZIP is reported clearly", async () => {
  await assert.rejects(
    lookupZip("00000", { fetchImpl: async () => ({ ok: false, status: 404 }) }),
    /ZIP 00000 was not found/
  );
});

test("distance is right for a known pair", () => {
  // SF to Oakland is about 8 miles as the crow flies.
  const miles = distanceMiles(SF, OAKLAND);
  assert.ok(miles > 7 && miles < 10, `expected ~8 miles, got ${miles}`);
});

test("distance is right across the country", () => {
  // SF to New York is about 2570 miles.
  const miles = distanceMiles(SF, NEW_YORK);
  assert.ok(miles > 2500 && miles < 2650, `expected ~2570 miles, got ${miles}`);
});

test("the radius slider is clamped to the offered range", () => {
  assert.equal(clampRadius(20), 20);
  assert.equal(clampRadius(5), MIN_RADIUS_MILES);
  assert.equal(clampRadius(500), MAX_RADIUS_MILES);
  assert.equal(clampRadius("not a number"), DEFAULT_RADIUS_MILES);
  assert.equal(clampRadius(undefined), DEFAULT_RADIUS_MILES);
});
