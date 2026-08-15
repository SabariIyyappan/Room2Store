import type { Campaign, Item } from "../entities.ts";

export const fixtureTimestamp = "2026-08-15T09:00:00.000Z";

export const fixtureCampaign: Campaign = {
  id: "cmp_demo_room_001",
  sellerId: "seller_demo_001",
  slug: "mission-district-moveout",
  status: "pricing",
  exclusionList: ["laptop", "passport", "medicine"],
  bandRoomId: "band_room_demo_001",
  sandboxId: "sandbox_demo_001",
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp,
};

export const fixtureItems: Item[] = [
  {
    id: "item_office_chair_001",
    campaignId: fixtureCampaign.id,
    name: "Ergonomic office chair",
    category: "furniture",
    attributes: { material: "mesh", color: "black", adjustableArms: true },
    condition: "good",
    conditionNotes: "Minor scuffs on the arm rests; all adjustments work.",
    photoUrls: ["https://fixtures.room2store.test/chair-1.jpg", "https://fixtures.room2store.test/chair-2.jpg"],
    naivePrice: 40,
    status: "studying",
    listingV1: {
      title: "Office chair",
      description: "Black office chair in good condition.",
      photoUrls: ["https://fixtures.room2store.test/chair-1.jpg"],
      publicCopy: "Comfortable black office chair, pickup in San Francisco.",
    },
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
  {
    id: "item_headphones_001",
    campaignId: fixtureCampaign.id,
    name: "Wireless over-ear headphones",
    category: "electronics",
    attributes: { color: "silver", connection: "bluetooth", chargingCableIncluded: true },
    condition: "good",
    conditionNotes: "Light wear on ear pads; tested and charging.",
    photoUrls: ["https://fixtures.room2store.test/headphones-1.jpg"],
    naivePrice: 55,
    status: "draft",
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
  {
    id: "item_desk_lamp_001",
    campaignId: fixtureCampaign.id,
    name: "Adjustable LED desk lamp",
    category: "lighting",
    attributes: { color: "white", bulbType: "LED", adjustable: true },
    condition: "excellent",
    conditionNotes: "No visible marks; brightness control works.",
    photoUrls: ["https://fixtures.room2store.test/lamp-1.jpg"],
    naivePrice: 20,
    status: "draft",
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
];
