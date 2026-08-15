import assert from "node:assert/strict";
import test from "node:test";
import { fixtureItems } from "@room2store/contracts/fixtures";
import type { BandMessage } from "@room2store/contracts";
import type { BandClient } from "../src/band-client.ts";
import { InMemoryBandNetwork } from "../src/in-memory-band.ts";
import { bandRoles, type BandIdentity, type BandRole, roleNames } from "../src/roles.ts";
import { BandRoomService, type CampaignRoomStore } from "../src/room-service.ts";
import { spawnSpecialistsForCatalog } from "../src/spawn-specialists.ts";

const campaignId = "cmp_demo_room_001";
const [chair, headphones, lamp] = fixtureItems;

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
  return { network, roomService, roomId: room.roomId, bootstrapParticipants: room.participants };
}

test("B5 does not add specialists to the room at bootstrap", async () => {
  const { bootstrapParticipants } = await setup();
  assert.equal(bootstrapParticipants.length, 8);
  assert.ok(!bootstrapParticipants.some((peer) => peer.id === "agent_electronicsSpecialist" || peer.id === "agent_furnitureSpecialist"));
});

test("B5 spawns a furniture specialist that sends catalog back for a reshoot", async () => {
  const { roomService, roomId } = await setup();
  const outcomes = await spawnSpecialistsForCatalog(roomService, campaignId, roomId, [chair]);

  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].role, "furnitureSpecialist");
  assert.equal(outcomes[0].signaled, true);

  const history = await roomService.readProtocolHistory(roomId);
  const spawn = history.find((message): message is Extract<BandMessage, { name: "specialist spawn" }> => message.name === "specialist spawn");
  const reshoot = history.find((message): message is Extract<BandMessage, { name: "catalog needs reshoot" }> => message.name === "catalog needs reshoot");

  assert.ok(spawn, "expected a specialist spawn message");
  assert.equal(spawn?.itemId, chair.id);
  assert.ok(reshoot, "expected a catalog needs reshoot message");
  assert.equal(reshoot?.itemId, chair.id);
  assert.equal(reshoot?.emitter, "specialist");
});

test("B5 spawns an electronics specialist that flags a missing serial number without a hard block", async () => {
  const { roomService, roomId } = await setup();
  const outcomes = await spawnSpecialistsForCatalog(roomService, campaignId, roomId, [headphones]);

  assert.equal(outcomes[0].role, "electronicsSpecialist");
  assert.equal(outcomes[0].signaled, true);

  const history = await roomService.readProtocolHistory(roomId);
  const spawn = history.find((message): message is Extract<BandMessage, { name: "specialist spawn" }> => message.name === "specialist spawn");
  assert.ok(spawn);
  // The serial-number flag is a Band event/note, not a protocol message — it must not appear as a second gate-relevant message.
  assert.equal(history.filter((message) => message.name === "catalog needs reshoot").length, 0);
});

test("B5 spawns nobody for a category neither specialist covers", async () => {
  const { roomService, roomId } = await setup();
  const outcomes = await spawnSpecialistsForCatalog(roomService, campaignId, roomId, [lamp]);
  assert.equal(outcomes.length, 0);
  assert.equal((await roomService.readProtocolHistory(roomId)).length, 0);
});
