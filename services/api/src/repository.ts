import { randomUUID } from "node:crypto";
import type { Campaign, Item, Order, PriceEvidence, Verdict } from "@room2store/contracts";
import postgres from "postgres";

export interface CampaignEvent {
  id: string;
  campaignId: string;
  itemId?: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface ApiRepository {
  createCampaign(campaign: Campaign): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  updateCampaign(id: string, changes: Partial<Campaign>): Promise<Campaign | undefined>;
  listItems(campaignId: string): Promise<Item[]>;
  createItem(item: Item): Promise<Item>;
  updateItem(id: string, changes: Partial<Item>): Promise<Item | undefined>;
  storePriceEvidence(evidence: PriceEvidence): Promise<PriceEvidence>;
  getPriceEvidence(itemId: string): Promise<PriceEvidence | undefined>;
  storeVerdict(verdict: Verdict): Promise<Verdict>;
  getVerdict(itemId: string): Promise<Verdict | undefined>;
  createOrder(order: Order): Promise<Order>;
  addEvent(event: Omit<CampaignEvent, "id" | "occurredAt">): Promise<CampaignEvent>;
  listEvents(campaignId: string): Promise<CampaignEvent[]>;
  close(): Promise<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryRepository implements ApiRepository {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly items = new Map<string, Item>();
  private readonly evidence = new Map<string, PriceEvidence>();
  private readonly verdicts = new Map<string, Verdict>();
  private readonly orders = new Map<string, Order>();
  private readonly events: CampaignEvent[] = [];

  async createCampaign(campaign: Campaign): Promise<Campaign> {
    this.campaigns.set(campaign.id, clone(campaign));
    return clone(campaign);
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const campaign = this.campaigns.get(id);
    return campaign && clone(campaign);
  }

  async updateCampaign(id: string, changes: Partial<Campaign>): Promise<Campaign | undefined> {
    const campaign = this.campaigns.get(id);
    if (!campaign) return undefined;
    const updated = { ...campaign, ...clone(changes), id, updatedAt: new Date().toISOString() };
    this.campaigns.set(id, updated);
    return clone(updated);
  }

  async listItems(campaignId: string): Promise<Item[]> {
    return [...this.items.values()].filter((item) => item.campaignId === campaignId).map(clone);
  }

  async createItem(item: Item): Promise<Item> {
    this.items.set(item.id, clone(item));
    return clone(item);
  }

  async updateItem(id: string, changes: Partial<Item>): Promise<Item | undefined> {
    const item = this.items.get(id);
    if (!item) return undefined;
    const updated = { ...item, ...clone(changes), id, updatedAt: new Date().toISOString() };
    this.items.set(id, updated);
    return clone(updated);
  }

  async storePriceEvidence(evidence: PriceEvidence): Promise<PriceEvidence> {
    this.evidence.set(evidence.itemId, clone(evidence));
    return clone(evidence);
  }

  async getPriceEvidence(itemId: string): Promise<PriceEvidence | undefined> {
    const evidence = this.evidence.get(itemId);
    return evidence && clone(evidence);
  }

  async storeVerdict(verdict: Verdict): Promise<Verdict> {
    this.verdicts.set(verdict.itemId, clone(verdict));
    return clone(verdict);
  }

  async getVerdict(itemId: string): Promise<Verdict | undefined> {
    const verdict = this.verdicts.get(itemId);
    return verdict && clone(verdict);
  }

  async createOrder(order: Order): Promise<Order> {
    this.orders.set(order.id, clone(order));
    return clone(order);
  }

  async addEvent(event: Omit<CampaignEvent, "id" | "occurredAt">): Promise<CampaignEvent> {
    const stored = { ...clone(event), id: randomUUID(), occurredAt: new Date().toISOString() };
    this.events.push(stored);
    return clone(stored);
  }

  async listEvents(campaignId: string): Promise<CampaignEvent[]> {
    return this.events.filter((event) => event.campaignId === campaignId).map(clone);
  }

  async close(): Promise<void> {}
}

type DatabaseRow = Record<string, unknown>;

const fromJson = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;
const toIso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));
const toNumber = (value: unknown): number => Number(value);

function mapCampaign(row: DatabaseRow): Campaign {
  return {
    id: String(row.id), sellerId: String(row.seller_id), slug: String(row.slug), status: row.status as Campaign["status"],
    exclusionList: fromJson<string[]>(row.exclusion_list), storeUrl: row.store_url ? String(row.store_url) : undefined,
    sandboxId: row.sandbox_id ? String(row.sandbox_id) : undefined, bandRoomId: row.band_room_id ? String(row.band_room_id) : undefined,
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
  };
}

function mapItem(row: DatabaseRow): Item {
  return {
    id: String(row.id), campaignId: String(row.campaign_id), name: String(row.name), category: String(row.category),
    attributes: fromJson<Item["attributes"]>(row.attributes), condition: String(row.condition), conditionNotes: String(row.condition_notes),
    photoUrls: fromJson<string[]>(row.photo_urls), naivePrice: row.naive_price === null ? undefined : toNumber(row.naive_price),
    measuredPrice: row.measured_price === null ? undefined : toNumber(row.measured_price), floorPrice: row.floor_price === null ? undefined : toNumber(row.floor_price),
    listingV1: row.listing_v1 ? fromJson<Item["listingV1"]>(row.listing_v1) : undefined,
    listingV2: row.listing_v2 ? fromJson<Item["listingV2"]>(row.listing_v2) : undefined,
    status: row.status as Item["status"], createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
  };
}

function mapEvidence(row: DatabaseRow): PriceEvidence {
  return {
    id: String(row.id), itemId: String(row.item_id), studyId: String(row.study_id), sampleSize: toNumber(row.sample_size),
    pricePoints: fromJson<PriceEvidence["pricePoints"]>(row.price_points), curveFitQuality: toNumber(row.curve_fit_quality),
    recommendedPrice: toNumber(row.recommended_price), floorPrice: toNumber(row.floor_price),
    expectedRevenueBefore: toNumber(row.expected_revenue_before), expectedRevenueAfter: toNumber(row.expected_revenue_after),
    listingDefects: fromJson<string[]>(row.listing_defects), createdAt: toIso(row.created_at),
  };
}

function mapVerdict(row: DatabaseRow): Verdict {
  return {
    id: String(row.id), itemId: String(row.item_id), decision: row.decision as Verdict["decision"],
    rulesTriggered: fromJson<string[]>(row.rules_triggered), reason: String(row.reason), createdAt: toIso(row.created_at),
  };
}

function mapOrder(row: DatabaseRow): Order {
  return {
    id: String(row.id), itemId: String(row.item_id), buyerHandle: String(row.buyer_handle), amount: toNumber(row.amount),
    currency: row.currency as Order["currency"], channel: row.channel as Order["channel"],
    stripeReference: row.stripe_reference ? String(row.stripe_reference) : undefined, status: row.status as Order["status"],
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
  };
}

function mapEvent(row: DatabaseRow): CampaignEvent {
  return {
    id: String(row.id), campaignId: String(row.campaign_id), itemId: row.item_id ? String(row.item_id) : undefined,
    type: String(row.type), payload: fromJson<Record<string, unknown>>(row.payload), occurredAt: toIso(row.occurred_at),
  };
}

export class PostgresRepository implements ApiRepository {
  private readonly sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  async createCampaign(campaign: Campaign): Promise<Campaign> {
    await this.sql.unsafe(
      "INSERT INTO campaigns (id, seller_id, slug, status, exclusion_list, store_url, sandbox_id, band_room_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)",
      [campaign.id, campaign.sellerId, campaign.slug, campaign.status, JSON.stringify(campaign.exclusionList), campaign.storeUrl ?? null, campaign.sandboxId ?? null, campaign.bandRoomId ?? null, campaign.createdAt, campaign.updatedAt],
    );
    return campaign;
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const rows = await this.sql.unsafe("SELECT * FROM campaigns WHERE id = $1", [id]);
    return rows[0] ? mapCampaign(rows[0] as DatabaseRow) : undefined;
  }

  async updateCampaign(id: string, changes: Partial<Campaign>): Promise<Campaign | undefined> {
    const current = await this.getCampaign(id);
    if (!current) return undefined;
    const next = { ...current, ...changes, id, updatedAt: new Date().toISOString() };
    await this.sql.unsafe(
      "UPDATE campaigns SET seller_id=$2, slug=$3, status=$4, exclusion_list=$5::jsonb, store_url=$6, sandbox_id=$7, band_room_id=$8, updated_at=$9 WHERE id=$1",
      [id, next.sellerId, next.slug, next.status, JSON.stringify(next.exclusionList), next.storeUrl ?? null, next.sandboxId ?? null, next.bandRoomId ?? null, next.updatedAt],
    );
    return next;
  }

  async listItems(campaignId: string): Promise<Item[]> {
    const rows = await this.sql.unsafe("SELECT * FROM items WHERE campaign_id = $1 ORDER BY created_at", [campaignId]);
    return rows.map((row) => mapItem(row as DatabaseRow));
  }

  async createItem(item: Item): Promise<Item> {
    await this.sql.unsafe(
      "INSERT INTO items (id,campaign_id,name,category,attributes,condition,condition_notes,photo_urls,naive_price,measured_price,floor_price,listing_v1,listing_v2,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16)",
      [item.id, item.campaignId, item.name, item.category, JSON.stringify(item.attributes), item.condition, item.conditionNotes, JSON.stringify(item.photoUrls), item.naivePrice ?? null, item.measuredPrice ?? null, item.floorPrice ?? null, item.listingV1 ? JSON.stringify(item.listingV1) : null, item.listingV2 ? JSON.stringify(item.listingV2) : null, item.status, item.createdAt, item.updatedAt],
    );
    return item;
  }

  async updateItem(id: string, changes: Partial<Item>): Promise<Item | undefined> {
    const rows = await this.sql.unsafe("SELECT * FROM items WHERE id = $1", [id]);
    if (!rows[0]) return undefined;
    const current = mapItem(rows[0] as DatabaseRow);
    const next = { ...current, ...changes, id, updatedAt: new Date().toISOString() };
    await this.sql.unsafe(
      "UPDATE items SET name=$2,category=$3,attributes=$4::jsonb,condition=$5,condition_notes=$6,photo_urls=$7::jsonb,naive_price=$8,measured_price=$9,floor_price=$10,listing_v1=$11::jsonb,listing_v2=$12::jsonb,status=$13,updated_at=$14 WHERE id=$1",
      [id, next.name, next.category, JSON.stringify(next.attributes), next.condition, next.conditionNotes, JSON.stringify(next.photoUrls), next.naivePrice ?? null, next.measuredPrice ?? null, next.floorPrice ?? null, next.listingV1 ? JSON.stringify(next.listingV1) : null, next.listingV2 ? JSON.stringify(next.listingV2) : null, next.status, next.updatedAt],
    );
    return next;
  }

  async storePriceEvidence(evidence: PriceEvidence): Promise<PriceEvidence> {
    await this.sql.unsafe(
      "INSERT INTO studies (id,item_id,status,sample_size,completed_at) VALUES ($1,$2,'completed',$3,$4) ON CONFLICT (id) DO NOTHING",
      [evidence.studyId, evidence.itemId, evidence.sampleSize, evidence.createdAt],
    );
    await this.sql.unsafe(
      "INSERT INTO price_evidence (id,item_id,study_id,sample_size,price_points,curve_fit_quality,recommended_price,floor_price,expected_revenue_before,expected_revenue_after,listing_defects,created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT (item_id) DO UPDATE SET id=EXCLUDED.id,study_id=EXCLUDED.study_id,sample_size=EXCLUDED.sample_size,price_points=EXCLUDED.price_points,curve_fit_quality=EXCLUDED.curve_fit_quality,recommended_price=EXCLUDED.recommended_price,floor_price=EXCLUDED.floor_price,expected_revenue_before=EXCLUDED.expected_revenue_before,expected_revenue_after=EXCLUDED.expected_revenue_after,listing_defects=EXCLUDED.listing_defects,created_at=EXCLUDED.created_at",
      [evidence.id, evidence.itemId, evidence.studyId, evidence.sampleSize, JSON.stringify(evidence.pricePoints), evidence.curveFitQuality, evidence.recommendedPrice, evidence.floorPrice, evidence.expectedRevenueBefore, evidence.expectedRevenueAfter, JSON.stringify(evidence.listingDefects), evidence.createdAt],
    );
    return evidence;
  }

  async getPriceEvidence(itemId: string): Promise<PriceEvidence | undefined> {
    const rows = await this.sql.unsafe("SELECT * FROM price_evidence WHERE item_id = $1", [itemId]);
    return rows[0] ? mapEvidence(rows[0] as DatabaseRow) : undefined;
  }

  async storeVerdict(verdict: Verdict): Promise<Verdict> {
    await this.sql.unsafe(
      "INSERT INTO verdicts (id,item_id,decision,rules_triggered,reason,created_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT (item_id) DO UPDATE SET id=EXCLUDED.id,decision=EXCLUDED.decision,rules_triggered=EXCLUDED.rules_triggered,reason=EXCLUDED.reason,created_at=EXCLUDED.created_at",
      [verdict.id, verdict.itemId, verdict.decision, JSON.stringify(verdict.rulesTriggered), verdict.reason, verdict.createdAt],
    );
    return verdict;
  }

  async getVerdict(itemId: string): Promise<Verdict | undefined> {
    const rows = await this.sql.unsafe("SELECT * FROM verdicts WHERE item_id = $1", [itemId]);
    return rows[0] ? mapVerdict(rows[0] as DatabaseRow) : undefined;
  }

  async createOrder(order: Order): Promise<Order> {
    await this.sql.unsafe(
      "INSERT INTO orders (id,item_id,buyer_handle,amount,currency,channel,stripe_reference,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [order.id, order.itemId, order.buyerHandle, order.amount, order.currency, order.channel, order.stripeReference ?? null, order.status, order.createdAt, order.updatedAt],
    );
    return order;
  }

  async addEvent(event: Omit<CampaignEvent, "id" | "occurredAt">): Promise<CampaignEvent> {
    const stored = { ...event, id: randomUUID(), occurredAt: new Date().toISOString() };
    await this.sql.unsafe(
      "INSERT INTO events (id,campaign_id,item_id,type,payload,occurred_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
      [stored.id, stored.campaignId, stored.itemId ?? null, stored.type, JSON.stringify(stored.payload), stored.occurredAt],
    );
    return stored;
  }

  async listEvents(campaignId: string): Promise<CampaignEvent[]> {
    const rows = await this.sql.unsafe("SELECT * FROM events WHERE campaign_id = $1 ORDER BY occurred_at", [campaignId]);
    return rows.map((row) => mapEvent(row as DatabaseRow));
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
