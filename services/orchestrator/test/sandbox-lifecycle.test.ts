import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryBandNetwork } from "../src/in-memory-band.ts";
import { type BandIdentity, type BandRole, bandRoles, roleNames } from "../src/roles.ts";
import { BandRoomService, type CampaignRoomStore } from "../src/room-service.ts";
import { LocalSandboxManager } from "../src/sandbox-manager.ts";
import type { BandClient } from "../src/band-client.ts";

class MemoryCampaignStore implements CampaignRoomStore {
  async assertCampaignExists(_campaignId: string): Promise<void> {}
  async setBandRoom(_campaignId: string, _roomId: string): Promise<void> {}
}

function identities(): Record<BandRole, BandIdentity> {
  return Object.fromEntries(bandRoles.map((role) => [role, {
    role, name: roleNames[role], agentId: `agent_${role}`, apiKey: `key_${role}`,
  }])) as Record<BandRole, BandIdentity>;
}

function service(sandboxManager: LocalSandboxManager) {
  const network = new InMemoryBandNetwork();
  const configuredIdentities = identities();
  const clients = {} as Record<BandRole, BandClient>;
  for (const role of bandRoles) clients[role] = network.createClient(configuredIdentities[role]);
  return { network, service: new BandRoomService(clients, new MemoryCampaignStore(), sandboxManager) };
}

test("B8: 'store deployed' pauses the campaign's sandbox and logs it to the Band feed", async () => {
  const sandboxManager = new LocalSandboxManager();
  await sandboxManager.provision("cmp_lifecycle_001");
  const { network, service: roomService } = service(sandboxManager);
  const room = await roomService.createCampaignRoom("cmp_lifecycle_001");
  const eventsBeforeDeploy = network.eventCount(room.roomId);

  await roomService.postProtocolMessage({
    roomId: room.roomId,
    role: "storePublisher",
    recipients: ["salesConcierge"],
    message: {
      id: "msg_deploy_001", campaignId: "cmp_lifecycle_001", emittedAt: "2026-08-15T10:00:00.000Z", emitter: "store",
      name: "store deployed", storeUrl: "https://demo.example/cmp_lifecycle_001", itemIds: ["item_1"],
    },
  });

  // One event for the protocol message itself, one for the sandbox pause it triggered.
  assert.equal(network.eventCount(room.roomId), eventsBeforeDeploy + 2);

  const paused = await sandboxManager.pause("cmp_lifecycle_001", "recheck");
  assert.match(paused.reason, /already paused/);
});

test("B8: 'sales inquiry / offer' resumes the campaign's sandbox and logs it to the Band feed", async () => {
  const sandboxManager = new LocalSandboxManager();
  await sandboxManager.provision("cmp_lifecycle_002");
  await sandboxManager.pause("cmp_lifecycle_002", "store deployed earlier");
  const { network, service: roomService } = service(sandboxManager);
  const room = await roomService.createCampaignRoom("cmp_lifecycle_002");
  const eventsBeforeInquiry = network.eventCount(room.roomId);

  await roomService.postProtocolMessage({
    roomId: room.roomId,
    role: "salesConcierge",
    recipients: ["settlementClerk"],
    message: {
      id: "msg_inquiry_001", campaignId: "cmp_lifecycle_002", emittedAt: "2026-08-15T11:00:00.000Z", emitter: "sales",
      name: "sales inquiry / offer", itemId: "item_1", buyerHandle: "@buyer_jane", amount: 42,
    },
  });

  assert.equal(network.eventCount(room.roomId), eventsBeforeInquiry + 2);

  const resumedAgain = await sandboxManager.resume("cmp_lifecycle_002", "recheck");
  assert.match(resumedAgain.reason, /already active/);
});

test("B8: a message not on the sandbox's lifecycle never touches it", async () => {
  const sandboxManager = new LocalSandboxManager();
  const { service: roomService } = service(sandboxManager);
  const room = await roomService.createCampaignRoom("cmp_lifecycle_003");

  await roomService.postProtocolMessage({
    roomId: room.roomId,
    role: "priceSetter",
    recipients: ["salesConcierge"],
    message: {
      id: "msg_price_001", campaignId: "cmp_lifecycle_003", emittedAt: "2026-08-15T09:00:00.000Z", emitter: "pricing",
      name: "price set", itemId: "item_1", price: 40, floor: 25,
    },
  });

  await assert.rejects(sandboxManager.pause("cmp_lifecycle_003", "x"), /No Superserve sandbox provisioned/);
});
