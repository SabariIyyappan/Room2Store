import { randomUUID } from "node:crypto";
import type { Campaign, Item, Order, PriceEvidence, Verdict } from "@room2store/contracts";
import {
  bandRoles,
  BandRoomService,
  InMemoryBandNetwork,
  LocalSandboxManager,
  roleNames,
  type BandClient,
  type BandIdentity,
  type BandRole,
  type CampaignRoomStore,
} from "@room2store/orchestrator";
import type { ApiClient } from "../src/api-client.ts";
import type { StageIntegrations } from "../src/stage-integrations.ts";

export class MemoryCampaignStore implements CampaignRoomStore {
  async assertCampaignExists(_campaignId: string): Promise<void> {}
  async setBandRoom(_campaignId: string, _roomId: string): Promise<void> {}
}

export function identities(): Record<BandRole, BandIdentity> {
  return Object.fromEntries(bandRoles.map((role) => [role, { role, name: roleNames[role], agentId: `agent_${role}`, apiKey: `key_${role}` }])) as Record<BandRole, BandIdentity>;
}

/** Same in-memory Band + specialist-identity setup as `gate-engine.test.ts`, plus a `LocalSandboxManager` so pause/resume are observable. */
export async function setupRoom() {
  const network = new InMemoryBandNetwork();
  const configured = identities();
  const clients = {} as Record<BandRole, BandClient>;
  for (const role of bandRoles) clients[role] = network.createClient(configured[role]);
  const sandboxManager = new LocalSandboxManager();
  const roomService = new BandRoomService(clients, new MemoryCampaignStore(), sandboxManager);
  const room = await roomService.createCampaignRoom("cmp_demo_room_001");
  // bootstrap.ts provisions the campaign's sandbox right after the room is
  // created (C0) — mirrored here so "store deployed"/"sales inquiry" can
  // pause/resume it, same as production.
  await sandboxManager.provision(room.campaignId);
  return { roomService, roomId: room.roomId, sandboxManager };
}

/** An in-memory `ApiClient` — no Postgres/`services/api` process required for these tests. */
export class MemoryApiClient implements ApiClient {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly items = new Map<string, Item>();
  readonly orders: Order[] = [];
  readonly priceEvidence: PriceEvidence[] = [];
  readonly verdicts: Verdict[] = [];

  seedCampaign(campaign: Campaign): void {
    this.campaigns.set(campaign.id, campaign);
  }

  seedItems(items: Item[]): void {
    for (const item of items) this.items.set(item.id, item);
  }

  async getCampaign(campaignId: string): Promise<Campaign> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error(`Unknown campaign ${campaignId}`);
    return campaign;
  }

  async patchCampaign(campaignId: string, changes: Partial<Campaign>): Promise<Campaign> {
    const updated = { ...(await this.getCampaign(campaignId)), ...changes };
    this.campaigns.set(campaignId, updated);
    return updated;
  }

  async listItems(campaignId: string): Promise<Item[]> {
    return [...this.items.values()].filter((item) => item.campaignId === campaignId);
  }

  async createItem(campaignId: string, item: Partial<Item>): Promise<Item> {
    const now = new Date().toISOString();
    const created: Item = { status: "draft", attributes: {}, condition: "", conditionNotes: "", photoUrls: [], createdAt: now, updatedAt: now, ...item, campaignId, id: item.id ?? `item_${randomUUID()}`, name: item.name ?? "unnamed", category: item.category ?? "misc" };
    this.items.set(created.id, created);
    return created;
  }

  async patchItem(itemId: string, changes: Partial<Item>): Promise<Item> {
    const existing = this.items.get(itemId);
    if (!existing) throw new Error(`Unknown item ${itemId}`);
    const updated = { ...existing, ...changes };
    this.items.set(itemId, updated);
    return updated;
  }

  async postPriceEvidence(_itemId: string, evidence: PriceEvidence): Promise<PriceEvidence> {
    this.priceEvidence.push(evidence);
    return evidence;
  }

  async getPriceEvidence(itemId: string): Promise<PriceEvidence | undefined> {
    return this.priceEvidence.filter((evidence) => evidence.itemId === itemId).at(-1);
  }

  async postVerdict(_itemId: string, verdict: Verdict): Promise<Verdict> {
    this.verdicts.push(verdict);
    return verdict;
  }

  async postOrder(order: Order): Promise<Order> {
    this.orders.push(order);
    return order;
  }
}

/** Deterministic stand-in for A/C's not-yet-built services — same shape as `HybridStageIntegrations`'s fixture fallback, minus the network round trip. */
export function stubIntegrations(overrides: Partial<StageIntegrations> = {}): StageIntegrations {
  return {
    ingest: async () => [],
    priceStudy: async (item) => ({
      id: `evidence_${item.id}`, itemId: item.id, studyId: "study_test", sampleSize: 50,
      pricePoints: [{ price: 30, purchaseProbability: 0.5, expectedRevenue: 15 }],
      curveFitQuality: 0.9, recommendedPrice: 30, floorPrice: 24,
      expectedRevenueBefore: 10, expectedRevenueAfter: 15, listingDefects: [], createdAt: new Date().toISOString(),
    }),
    notifyBuyers: async () => ({ notified: 0 }),
    buildStorefront: async (campaign) => ({ storeUrl: `https://room2store-demo.test/${campaign.id}` }),
    ...overrides,
  };
}
