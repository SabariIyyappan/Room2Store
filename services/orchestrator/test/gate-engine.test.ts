import assert from "node:assert/strict";
import test from "node:test";
import { fixtureApproveVerdict, fixtureCarSeat, fixtureItems, fixturePriceEvidence, fixtureVetoVerdict } from "@room2store/contracts/fixtures";
import type { BandMessage } from "@room2store/contracts";
import type { BandClient } from "../src/band-client.ts";
import { GateEngine } from "../src/gate-engine.ts";
import { InMemoryBandNetwork } from "../src/in-memory-band.ts";
import { bandRoles, type BandIdentity, type BandRole, roleNames } from "../src/roles.ts";
import { BandRoomService, type CampaignRoomStore } from "../src/room-service.ts";

const campaignId = "cmp_demo_room_001";
const itemId = fixtureItems[0].id;

class MemoryCampaignStore implements CampaignRoomStore {
  async assertCampaignExists(_campaignId: string): Promise<void> {}
  async setBandRoom(_campaignId: string, _roomId: string): Promise<void> {}
}

function identities(): Record<BandRole, BandIdentity> {
  return Object.fromEntries(bandRoles.map((role) => [role, { role, name: roleNames[role], agentId: `agent_${role}`, apiKey: `key_${role}` }])) as Record<BandRole, BandIdentity>;
}

async function setup() {
  const network = new InMemoryBandNetwork();
  const configured = identities();
  const clients = {} as Record<BandRole, BandClient>;
  for (const role of bandRoles) clients[role] = network.createClient(configured[role]);
  const roomService = new BandRoomService(clients, new MemoryCampaignStore());
  const room = await roomService.createCampaignRoom(campaignId);
  return { roomService, roomId: room.roomId, engine: new GateEngine(roomService) };
}

function protocol<T extends BandMessage>(message: T): T { return message; }

test("B4 blocks price setting without research evidence and skips the mutation", async () => {
  const { roomService, roomId, engine } = await setup();
  let mutationRan = false;
  const result = await engine.run({ transition: "setPrice", campaignId, roomId, itemId }, async () => { mutationRan = true; });

  assert.equal(result.gate.allowed, false);
  assert.equal(mutationRan, false);
  const history = await roomService.readProtocolHistory(roomId);
  assert.equal(history.at(-1)?.name, "gate blocked");
  assert.match((history.at(-1) as Extract<BandMessage, { name: "gate blocked" }>).missingPrerequisite, /research price evidence/);
});

test("B4 permits price setting after matching research evidence", async () => {
  const { roomService, roomId, engine } = await setup();
  await roomService.postProtocolMessage({
    roomId, role: "pricingResearcher", recipients: ["priceSetter"],
    message: protocol({ id: "research_001", campaignId, emittedAt: "2026-08-15T10:00:00Z", emitter: "research", name: "research price evidence", evidence: fixturePriceEvidence }),
  });
  let mutationRan = false;
  const result = await engine.run({ transition: "setPrice", campaignId, roomId, itemId }, async () => { mutationRan = true; return "priced"; });

  assert.equal(result.gate.allowed, true);
  assert.equal(mutationRan, true);
  assert.equal(result.value, "priced");
});

test("B4 requires catalog completion before research starts", async () => {
  const { roomService, roomId, engine } = await setup();
  assert.equal((await engine.evaluate({ transition: "startResearch", campaignId, roomId, itemId })).allowed, false);
  await roomService.postProtocolMessage({
    roomId, role: "roomCataloger", recipients: ["pricingResearcher"],
    message: protocol({ id: "catalog_001", campaignId, emittedAt: "2026-08-15T10:00:00Z", emitter: "catalog", name: "catalog items ready", itemIds: [itemId] }),
  });
  assert.equal((await engine.evaluate({ transition: "startResearch", campaignId, roomId, itemId })).allowed, true);
});

test("B5 blocks research after a reshoot request until catalog re-clears the item", async () => {
  const { roomService, roomId, engine } = await setup();
  await roomService.postProtocolMessage({
    roomId, role: "roomCataloger", recipients: ["pricingResearcher"],
    message: protocol({ id: "catalog_002", campaignId, emittedAt: "2026-08-15T10:00:00Z", emitter: "catalog", name: "catalog items ready", itemIds: [itemId] }),
  });
  assert.equal((await engine.evaluate({ transition: "startResearch", campaignId, roomId, itemId })).allowed, true);

  await roomService.spawnSpecialist({ roomId, campaignId, role: "furnitureSpecialist", itemId, reason: "furniture needs verified dimensions" });
  await roomService.postProtocolMessage({
    roomId, role: "furnitureSpecialist", recipients: ["roomCataloger"],
    message: protocol({ id: "reshoot_002", campaignId, emittedAt: "2026-08-15T10:05:00Z", emitter: "specialist", name: "catalog needs reshoot", itemId, reason: "no dimensions captured" }),
  });
  const blocked = await engine.evaluate({ transition: "startResearch", campaignId, roomId, itemId });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.match(blocked.missingPrerequisites[0], /reshoot/);

  await roomService.postProtocolMessage({
    roomId, role: "roomCataloger", recipients: ["pricingResearcher"],
    message: protocol({ id: "catalog_003", campaignId, emittedAt: "2026-08-15T10:10:00Z", emitter: "catalog", name: "catalog items ready", itemIds: [itemId] }),
  });
  assert.equal((await engine.evaluate({ transition: "startResearch", campaignId, roomId, itemId })).allowed, true);
});

test("B4 requires a compliance approval before store deployment", async () => {
  const { roomService, roomId, engine } = await setup();
  assert.equal((await engine.evaluate({ transition: "deployStore", campaignId, roomId, itemIds: [itemId] })).allowed, false);
  await roomService.postProtocolMessage({
    roomId, role: "safetyReviewer", recipients: ["storePublisher"],
    message: protocol({ id: "verdict_001", campaignId, emittedAt: "2026-08-15T10:00:00Z", emitter: "compliance", name: "compliance verdict", verdict: fixtureApproveVerdict }),
  });
  assert.equal((await engine.evaluate({ transition: "deployStore", campaignId, roomId, itemIds: [itemId] })).allowed, true);
});

test("B4 makes a compliance veto terminal for store deployment", async () => {
  const { roomService, roomId, engine } = await setup();
  await roomService.postProtocolMessage({
    roomId, role: "safetyReviewer", recipients: ["storePublisher"],
    message: protocol({ id: "veto_001", campaignId, emittedAt: "2026-08-15T10:00:00Z", emitter: "compliance", name: "compliance verdict", verdict: fixtureVetoVerdict }),
  });
  const result = await engine.evaluate({ transition: "deployStore", campaignId, roomId, itemIds: [fixtureCarSeat.id] });

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.missingPrerequisites[0], /APPROVE/);
});

test("B4 requires a floor price before sale close", async () => {
  const { roomService, roomId, engine } = await setup();
  assert.equal((await engine.evaluate({ transition: "closeSale", campaignId, roomId, itemId })).allowed, false);
  await roomService.postProtocolMessage({
    roomId, role: "priceSetter", recipients: ["salesConcierge"],
    message: protocol({ id: "price_001", campaignId, emittedAt: "2026-08-15T10:00:00Z", emitter: "pricing", name: "price set", itemId, price: 32, floor: 26 }),
  });
  assert.equal((await engine.evaluate({ transition: "closeSale", campaignId, roomId, itemId })).allowed, true);
});

test("B4 requires sales close before payment is recorded", async () => {
  const { roomService, roomId, engine } = await setup();
  const orderId = "order_001";
  assert.equal((await engine.evaluate({ transition: "recordPayment", campaignId, roomId, orderId })).allowed, false);
  await roomService.postProtocolMessage({
    roomId, role: "salesConcierge", recipients: ["settlementClerk"],
    message: protocol({
      id: "sale_001", campaignId, emittedAt: "2026-08-15T10:00:00Z", emitter: "sales", name: "sales close",
      order: { id: orderId, itemId, buyerHandle: "buyer", amount: 32, currency: "USD", channel: "imessage", status: "pending", createdAt: "2026-08-15T10:00:00Z", updatedAt: "2026-08-15T10:00:00Z" },
    }),
  });
  assert.equal((await engine.evaluate({ transition: "recordPayment", campaignId, roomId, orderId })).allowed, true);
});
