import assert from "node:assert/strict";
import test from "node:test";
import { fixturePriceEvidence } from "@room2store/contracts/fixtures";
import { InMemoryBandNetwork } from "../src/in-memory-band.ts";
import { type BandIdentity, type BandRole, bandRoles, roleNames } from "../src/roles.ts";
import { BandRoomService, type CampaignRoomStore } from "../src/room-service.ts";
import type { BandClient } from "../src/band-client.ts";

class MemoryCampaignStore implements CampaignRoomStore {
  bandRooms = new Map<string, string>();
  async assertCampaignExists(_campaignId: string): Promise<void> {}
  async setBandRoom(campaignId: string, roomId: string): Promise<void> { this.bandRooms.set(campaignId, roomId); }
}

function identities(): Record<BandRole, BandIdentity> {
  return Object.fromEntries(bandRoles.map((role) => [role, {
    role, name: roleNames[role], agentId: `agent_${role}`, apiKey: `key_${role}`,
  }])) as Record<BandRole, BandIdentity>;
}

test("creates a campaign room and preserves pricing evidence for the coordinator", async () => {
  const network = new InMemoryBandNetwork();
  const configuredIdentities = identities();
  const clients = {} as Record<BandRole, BandClient>;
  for (const role of bandRoles) clients[role] = network.createClient(configuredIdentities[role]);
  const campaignStore = new MemoryCampaignStore();
  const service = new BandRoomService(clients, campaignStore);

  const bootstrap = await service.createCampaignRoom("cmp_demo_room_001");
  assert.equal(bootstrap.participants.length, 8);
  assert.equal(campaignStore.bandRooms.get("cmp_demo_room_001"), bootstrap.roomId);

  await service.postProtocolMessage({
    roomId: bootstrap.roomId,
    role: "pricingResearcher",
    recipients: ["priceSetter"],
    message: {
      id: "msg_evidence_001", campaignId: "cmp_demo_room_001", emittedAt: "2026-08-15T09:10:00.000Z", emitter: "research",
      name: "research price evidence", evidence: fixturePriceEvidence,
    },
  });

  const history = await service.readProtocolHistory(bootstrap.roomId);
  assert.equal(history.length, 1);
  assert.equal(history[0].name, "research price evidence");
  assert.equal(network.eventCount(bootstrap.roomId), 2);
});

test("prevents a role from impersonating another Band protocol emitter", async () => {
  const network = new InMemoryBandNetwork();
  const configuredIdentities = identities();
  const clients = {} as Record<BandRole, BandClient>;
  for (const role of bandRoles) clients[role] = network.createClient(configuredIdentities[role]);
  const service = new BandRoomService(clients, new MemoryCampaignStore());
  const bootstrap = await service.createCampaignRoom("cmp_demo_room_002");

  await assert.rejects(
    service.postProtocolMessage({
      roomId: bootstrap.roomId, role: "storePublisher", recipients: ["priceSetter"],
      message: { id: "msg_bad_001", campaignId: "cmp_demo_room_002", emittedAt: "2026-08-15T09:10:00.000Z", emitter: "research", name: "research price evidence", evidence: fixturePriceEvidence },
    }),
    /cannot emit/,
  );
});
