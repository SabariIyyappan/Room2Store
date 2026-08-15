import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureCarSeat, fixtureItems } from "@room2store/contracts/fixtures";
import {
  BandRoomService,
  GateEngine,
  InMemoryBandNetwork,
  bandRoles,
  roleNames,
  type BandClient,
  type BandIdentity,
  type BandRole,
  type CampaignRoomStore,
} from "@room2store/orchestrator";
import { reviewItem } from "../src/review-item.ts";

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
  const room = await roomService.createCampaignRoom(fixtureCampaign.id);
  return { roomService, roomId: room.roomId, engine: new GateEngine(roomService) };
}

// This is the test file plan.md B6 says to show judges: the veto is not
// advisory. It is the exact same Band message the deployStore gate reads.
test("B6 veto genuinely blocks the store builder", async () => {
  const { roomService, roomId, engine } = await setup();

  const verdict = await reviewItem(roomService, fixtureCampaign.id, roomId, fixtureCarSeat, fixtureCampaign);
  assert.equal(verdict.decision, "veto");

  const gate = await engine.evaluate({ transition: "deployStore", campaignId: fixtureCampaign.id, roomId, itemIds: [fixtureCarSeat.id] });
  assert.equal(gate.allowed, false);
  if (!gate.allowed) assert.match(gate.missingPrerequisites[0], /APPROVE/);

  const history = await roomService.readProtocolHistory(roomId);
  assert.equal(history.at(-1)?.name, "gate blocked");
});

test("B6 approve verdict clears the store builder gate", async () => {
  const { roomService, roomId, engine } = await setup();
  const item = fixtureItems[0];

  const verdict = await reviewItem(roomService, fixtureCampaign.id, roomId, item, fixtureCampaign);
  assert.equal(verdict.decision, "approve");

  const gate = await engine.evaluate({ transition: "deployStore", campaignId: fixtureCampaign.id, roomId, itemIds: [item.id] });
  assert.equal(gate.allowed, true);
});

test("B6 a later approve does not erase an earlier veto for a different item in the same deploy batch", async () => {
  const { roomService, roomId, engine } = await setup();
  const clean = fixtureItems[0];

  await reviewItem(roomService, fixtureCampaign.id, roomId, fixtureCarSeat, fixtureCampaign);
  await reviewItem(roomService, fixtureCampaign.id, roomId, clean, fixtureCampaign);

  const gate = await engine.evaluate({
    transition: "deployStore",
    campaignId: fixtureCampaign.id,
    roomId,
    itemIds: [fixtureCarSeat.id, clean.id],
  });
  assert.equal(gate.allowed, false);
});
