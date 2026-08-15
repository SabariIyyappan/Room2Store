import type { Item, Verdict } from "../entities.ts";
import { fixtureCampaign, fixtureTimestamp } from "./campaign.ts";

export const fixtureApproveVerdict: Verdict = {
  id: "verdict_chair_approve_001",
  itemId: "item_office_chair_001",
  decision: "approve",
  rulesTriggered: [],
  reason: "No prohibited category, unsafe claim, excluded object, or public PII detected.",
  createdAt: fixtureTimestamp,
};

export const fixtureCarSeat: Item = {
  id: "item_car_seat_001",
  campaignId: fixtureCampaign.id,
  name: "Infant car seat",
  category: "car seats",
  attributes: { brand: "DemoBrand", stage: "infant" },
  condition: "used",
  conditionNotes: "Unknown accident history.",
  photoUrls: ["https://fixtures.room2store.test/car-seat-1.jpg"],
  status: "vetoed",
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp,
};

export const fixtureVetoVerdict: Verdict = {
  id: "verdict_car_seat_veto_001",
  itemId: fixtureCarSeat.id,
  decision: "veto",
  rulesTriggered: ["prohibited_category.car_seat"],
  reason: "Used car seats are prohibited because safety history cannot be verified.",
  createdAt: fixtureTimestamp,
};
