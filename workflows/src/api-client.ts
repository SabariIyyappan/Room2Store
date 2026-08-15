import type { Campaign, Item, Order, PriceEvidence, Verdict } from "@room2store/contracts";

/**
 * B9: the DAG's only path to durable state. Every task reads and writes
 * campaign/item state through `services/api` — same REST surface
 * `RestCampaignRoomStore` (room-service.ts) and the CLI scripts already use —
 * rather than importing `services/api`'s repository directly, so the
 * workflow service can run as its own Render-managed instance with no
 * dependency on the API process's internals.
 */
export interface ApiClient {
  getCampaign(campaignId: string): Promise<Campaign>;
  patchCampaign(campaignId: string, changes: Partial<Campaign>): Promise<Campaign>;
  listItems(campaignId: string): Promise<Item[]>;
  createItem(campaignId: string, item: Partial<Item>): Promise<Item>;
  patchItem(itemId: string, changes: Partial<Item>): Promise<Item>;
  postPriceEvidence(itemId: string, evidence: PriceEvidence): Promise<PriceEvidence>;
  /** B11: the last-stored PriceEvidence for an item, or `undefined` if it was never studied — used by `decayStage` to prefer learned elasticity over a flat cut. */
  getPriceEvidence(itemId: string): Promise<PriceEvidence | undefined>;
  postVerdict(itemId: string, verdict: Verdict): Promise<Verdict>;
  postOrder(order: Order): Promise<Order>;
}

export class RoomStoreApiClient implements ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.ROOM2STORE_API_BASE_URL ?? "http://localhost:3000") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!response.ok) throw new Error(`Room2Store API ${response.status} ${options.method ?? "GET"} ${path}`);
    return (await response.json()) as T;
  }

  getCampaign(campaignId: string): Promise<Campaign> {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}`);
  }

  patchCampaign(campaignId: string, changes: Partial<Campaign>): Promise<Campaign> {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}`, { method: "PATCH", body: JSON.stringify(changes) });
  }

  listItems(campaignId: string): Promise<Item[]> {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/items`);
  }

  createItem(campaignId: string, item: Partial<Item>): Promise<Item> {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/items`, { method: "POST", body: JSON.stringify(item) });
  }

  patchItem(itemId: string, changes: Partial<Item>): Promise<Item> {
    return this.request(`/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify(changes) });
  }

  postPriceEvidence(itemId: string, evidence: PriceEvidence): Promise<PriceEvidence> {
    return this.request(`/items/${encodeURIComponent(itemId)}/price-evidence`, { method: "POST", body: JSON.stringify(evidence) });
  }

  async getPriceEvidence(itemId: string): Promise<PriceEvidence | undefined> {
    const response = await fetch(`${this.baseUrl}/items/${encodeURIComponent(itemId)}/price-evidence`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Room2Store API ${response.status} GET /items/${itemId}/price-evidence`);
    return (await response.json()) as PriceEvidence;
  }

  postVerdict(itemId: string, verdict: Verdict): Promise<Verdict> {
    return this.request(`/items/${encodeURIComponent(itemId)}/verdict`, { method: "POST", body: JSON.stringify(verdict) });
  }

  postOrder(order: Order): Promise<Order> {
    return this.request("/orders", { method: "POST", body: JSON.stringify(order) });
  }
}
