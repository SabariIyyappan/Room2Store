import assert from "node:assert/strict";
import test from "node:test";
import { fixtureItems } from "@room2store/contracts/fixtures";
import {
  electronicsSerialCheck,
  furnitureDimensionCheck,
  inspectItemForSpecialist,
} from "../src/specialists.ts";

const [chair, headphones, lamp] = fixtureItems;

test("B5 spawns the furniture specialist for a furniture item", () => {
  const inspection = inspectItemForSpecialist(chair);
  assert.equal(inspection?.role, "furnitureSpecialist");
});

test("B5 spawns the electronics specialist for an electronics item", () => {
  const inspection = inspectItemForSpecialist(headphones);
  assert.equal(inspection?.role, "electronicsSpecialist");
});

test("B5 spawns nobody for a category neither specialist covers", () => {
  assert.equal(inspectItemForSpecialist(lamp), undefined);
});

test("B5 furniture specialist demands a reshoot when dimensions are missing", () => {
  const check = furnitureDimensionCheck(chair);
  assert.equal(check.needsReshoot, true);
  assert.match(check.reason ?? "", /dimensions/);
});

test("B5 furniture specialist clears an item once dimensions are present", () => {
  const measured = { ...chair, attributes: { ...chair.attributes, dimensions: "26in x 26in x 40in" } };
  assert.equal(furnitureDimensionCheck(measured).needsReshoot, false);
});

test("B5 electronics specialist flags an item with no serial number", () => {
  const check = electronicsSerialCheck(headphones);
  assert.equal(check.flagged, true);
  assert.match(check.reason ?? "", /serial number/);
});

test("B5 electronics specialist clears an item once a serial number is captured", () => {
  const verified = { ...headphones, attributes: { ...headphones.attributes, serialNumber: "SN-12345" } };
  assert.equal(electronicsSerialCheck(verified).flagged, false);
});
