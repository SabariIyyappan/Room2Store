import { randomUUID } from "node:crypto";
import type { BandMessage, Campaign, Item, Order, PriceEvidence, Verdict } from "@room2store/contracts";
import { spawnSpecialistsForCatalog, type BandRoomService, type GateEngine, type GateRequest, type SpecialistOutcome } from "@room2store/orchestrator";
import { reviewItem } from "@room2store/compliance";
import type { ApiClient } from "./api-client.ts";
import type { StageIntegrations } from "./stage-integrations.ts";
import { decideDecay, DECAY_UNSOLD_THRESHOLD_MS } from "./decay.ts";

/**
 * B9: this is the DAG — ingest, catalog, price, comply, build, market, sell,
 * settle as plan.md §3 names them, each a real function reading/writing
 * Postgres through the API and posting the real Band protocol message that
 * unblocks the next stage. `render-tasks.ts` registers each of these with
 * Render's SDK for cloud execution; `pipeline-cli.ts` and the tests call
 * them directly, since a Render `task()` wrapper is transparent to a plain
 * `await` — same code path either way. No stage here fabricates A's pricing
 * math or C's buyer copy; that's `StageIntegrations`'s job (or a
 * `*_SERVICE_URL` once A/C's services exist).
 */
export interface PipelineDeps {
  roomService: BandRoomService;
  gateEngine: GateEngine;
  api: ApiClient;
  integrations: StageIntegrations;
}

export interface GateStageResult<T> {
  allowed: boolean;
  missingPrerequisites?: string[];
  value?: T;
}

async function gated<T>(deps: PipelineDeps, request: GateRequest, run: () => Promise<T>): Promise<GateStageResult<T>> {
  const { gate, value } = await deps.gateEngine.run(request, run);
  return gate.allowed ? { allowed: true, value } : { allowed: false, missingPrerequisites: gate.missingPrerequisites };
}

/** Ensures the campaign has items in Postgres, seeding from A's perception service (or the fixture fallback) if it doesn't yet. */
export async function ingestStage(deps: PipelineDeps, campaignId: string): Promise<Item[]> {
  const existing = await deps.api.listItems(campaignId);
  if (existing.length > 0) return existing;

  const drafts = await deps.integrations.ingest(campaignId);
  const created: Item[] = [];
  for (const draft of drafts) created.push(await deps.api.createItem(campaignId, draft));
  return created;
}

/** Posts "catalog items ready" (unblocks research) and lets B5's specialists react — a furniture item missing dimensions re-blocks itself here. */
export async function catalogStage(deps: PipelineDeps, campaignId: string, roomId: string, items: Item[]): Promise<SpecialistOutcome[]> {
  await deps.roomService.postProtocolMessage({
    roomId,
    role: "roomCataloger",
    recipients: ["pricingResearcher"],
    message: { id: `catalog_${randomUUID()}`, campaignId, emittedAt: new Date().toISOString(), emitter: "catalog", name: "catalog items ready", itemIds: items.map((item) => item.id) },
  });
  return spawnSpecialistsForCatalog(deps.roomService, campaignId, roomId, items);
}

export interface PriceStageResult {
  research: GateStageResult<PriceEvidence>;
  setPrice: GateStageResult<{ price: number; floor: number }>;
}

/** Runs A's Terac study (or its fallback), then sets the price — two real gate checks, `startResearch` then `setPrice`. */
export async function priceStage(deps: PipelineDeps, campaignId: string, roomId: string, item: Item): Promise<PriceStageResult> {
  const research = await gated<PriceEvidence>(deps, { transition: "startResearch", campaignId, roomId, itemId: item.id }, async () => {
    const evidence = await deps.integrations.priceStudy(item);
    await deps.api.postPriceEvidence(item.id, evidence);
    await deps.roomService.postProtocolMessage({
      roomId, role: "pricingResearcher", recipients: ["priceSetter"],
      message: { id: `research_${randomUUID()}`, campaignId, emittedAt: new Date().toISOString(), emitter: "research", name: "research price evidence", evidence },
    });
    return evidence;
  });
  if (!research.allowed || !research.value) return { research, setPrice: { allowed: false, missingPrerequisites: research.missingPrerequisites } };

  const evidence = research.value;
  const setPrice = await gated<{ price: number; floor: number }>(deps, { transition: "setPrice", campaignId, roomId, itemId: item.id }, async () => {
    await deps.api.patchItem(item.id, { measuredPrice: evidence.recommendedPrice, floorPrice: evidence.floorPrice, status: "priced" });
    await deps.roomService.postProtocolMessage({
      roomId, role: "priceSetter", recipients: ["safetyReviewer", "salesConcierge"],
      message: { id: `price_${randomUUID()}`, campaignId, emittedAt: new Date().toISOString(), emitter: "pricing", name: "price set", itemId: item.id, price: evidence.recommendedPrice, floor: evidence.floorPrice },
    });
    return { price: evidence.recommendedPrice, floor: evidence.floorPrice };
  });
  return { research, setPrice };
}

/** B6's compliance verdict, persisted and posted for real — the only input `buildStage`'s `deployStore` gate reads. */
export async function complyStage(deps: PipelineDeps, campaignId: string, roomId: string, item: Item, campaign: Campaign): Promise<Verdict> {
  const verdict = await reviewItem(deps.roomService, campaignId, roomId, item, campaign);
  await deps.api.postVerdict(item.id, verdict);
  if (verdict.decision === "veto") await deps.api.patchItem(item.id, { status: "vetoed" });
  return verdict;
}

/** `deployStore` — a single veto anywhere in `items` blocks the whole batch, which is what the demo's veto beat relies on. */
export async function buildStage(deps: PipelineDeps, campaignId: string, roomId: string, items: Item[]): Promise<GateStageResult<{ storeUrl: string }>> {
  const itemIds = items.map((item) => item.id);
  return gated<{ storeUrl: string }>(deps, { transition: "deployStore", campaignId, roomId, itemIds }, async () => {
    const campaign = await deps.api.getCampaign(campaignId);
    const { storeUrl } = await deps.integrations.buildStorefront(campaign, items);
    await deps.api.patchCampaign(campaignId, { storeUrl, status: "live" });
    for (const item of items) await deps.api.patchItem(item.id, { status: "live" });
    await deps.roomService.postProtocolMessage({
      roomId, role: "storePublisher", recipients: ["salesConcierge"],
      message: { id: `deploy_${randomUUID()}`, campaignId, emittedAt: new Date().toISOString(), emitter: "store", name: "store deployed", storeUrl, itemIds },
    });
    return { storeUrl };
  });
}

/** Best-effort outbound to C's contact list — no Band message exists for this in the frozen protocol, so it's log-only. */
export async function marketStage(deps: PipelineDeps, campaignId: string, itemIds: string[]): Promise<{ notified: number }> {
  return deps.integrations.notifyBuyers(campaignId, itemIds);
}

/** A buyer's inquiry (this is what resumes B8's sandbox), then `closeSale` — gated on the floor price `priceStage` posted. */
export async function sellStage(deps: PipelineDeps, campaignId: string, roomId: string, itemId: string, buyerHandle: string, amount: number): Promise<GateStageResult<Order>> {
  await deps.roomService.postProtocolMessage({
    roomId, role: "salesConcierge", recipients: ["priceSetter"],
    message: { id: `inquiry_${randomUUID()}`, campaignId, emittedAt: new Date().toISOString(), emitter: "sales", name: "sales inquiry / offer", itemId, buyerHandle, amount },
  });

  return gated<Order>(deps, { transition: "closeSale", campaignId, roomId, itemId }, async () => {
    const now = new Date().toISOString();
    const order: Order = { id: `order_${randomUUID()}`, itemId, buyerHandle, amount, currency: "USD", channel: "imessage", status: "pending", createdAt: now, updatedAt: now };
    await deps.api.postOrder(order);
    await deps.api.patchItem(itemId, { status: "reserved" });
    await deps.roomService.postProtocolMessage({
      roomId, role: "salesConcierge", recipients: ["settlementClerk"],
      message: { id: `close_${randomUUID()}`, campaignId, emittedAt: new Date().toISOString(), emitter: "sales", name: "sales close", order },
    });
    return order;
  });
}

/** `recordPayment` — gated on the "sales close" `sellStage` posted; marks the item sold. */
export async function settleStage(deps: PipelineDeps, campaignId: string, roomId: string, order: Order): Promise<GateStageResult<void>> {
  return gated<void>(deps, { transition: "recordPayment", campaignId, roomId, orderId: order.id }, async () => {
    await deps.api.patchItem(order.itemId, { status: "sold" });
    await deps.roomService.postProtocolMessage({
      roomId, role: "settlementClerk", recipients: ["salesConcierge"],
      message: { id: `paid_${randomUUID()}`, campaignId, emittedAt: new Date().toISOString(), emitter: "finance", name: "finance paid", orderId: order.id, amount: order.amount },
    });
  });
}

export interface DecayStageResult {
  itemId: string;
  decayed: boolean;
  price?: number;
  reason: string;
  notified?: number;
}

/**
 * B11: the last message in `messages` for `itemId` whose name is "price
 * set" — its `emittedAt` is "when did this item's current price start",
 * the same room-history-as-timing-source precedent
 * `gate-engine.ts`'s `startResearch` established for reshoots. `undefined`
 * means the item was never priced (nothing to decay).
 */
function lastPriceSetAt(messages: BandMessage[], campaignId: string, itemId: string): string | undefined {
  const priceSets = messages
    .filter((message): message is Extract<BandMessage, { name: "price set" }> => message.name === "price set" && message.campaignId === campaignId && message.itemId === itemId)
    .sort((a, b) => a.emittedAt.localeCompare(b.emittedAt));
  return priceSets.at(-1)?.emittedAt;
}

/**
 * B11: an item unsold 24h after its current price was set either drops to a
 * learned-elasticity price point (from A's Study A `PriceEvidence`, when
 * one exists) or takes a flat cut, floored at `item.floorPrice` — see
 * `decay.ts` for the pure math. A price drop re-posts the frozen "price
 * set" message (the same message `priceStage` posts — plan.md's protocol
 * table has no separate "price decayed" entry, and the precedent for
 * reusing a frozen message for a related-but-distinct event is B8's
 * `postSandboxEvent` piggybacking on "store deployed"/"sales inquiry")
 * addressed to `salesConcierge` so it also refreshes `closeSale`'s floor
 * check. Then it calls `notifyBuyers` — B9's existing socket to C's
 * commerce layer, the same one `marketStage` uses — so "notify watchers"
 * doesn't require a new integration point.
 *
 * Only decays items already `"live"`; a vetoed, draft, or sold item has
 * nothing to decay.
 */
export async function decayStage(deps: PipelineDeps, campaignId: string, roomId: string, item: Item, now: Date = new Date()): Promise<DecayStageResult> {
  if (item.status !== "live") {
    return { itemId: item.id, decayed: false, reason: `item status is "${item.status}", not "live"` };
  }

  const history = await deps.roomService.readProtocolHistory(roomId);
  const lastSetAt = lastPriceSetAt(history, campaignId, item.id);
  if (!lastSetAt) return { itemId: item.id, decayed: false, reason: "no price set message found for this item" };

  const msSinceLastPriceSet = now.getTime() - new Date(lastSetAt).getTime();
  const evidence = await deps.api.getPriceEvidence(item.id);
  const decision = decideDecay(item, msSinceLastPriceSet, evidence);
  if (!decision.shouldDecay) return { itemId: item.id, decayed: false, reason: decision.reason };

  await deps.api.patchItem(item.id, { measuredPrice: decision.newPrice });
  await deps.roomService.postProtocolMessage({
    roomId, role: "priceSetter", recipients: ["salesConcierge"],
    message: {
      id: `decay_${randomUUID()}`, campaignId, emittedAt: now.toISOString(), emitter: "pricing", name: "price set",
      itemId: item.id, price: decision.newPrice, floor: item.floorPrice ?? decision.newPrice,
    },
  });

  const { notified } = await deps.integrations.notifyBuyers(campaignId, [item.id]);
  return { itemId: item.id, decayed: true, price: decision.newPrice, reason: decision.reason, notified };
}

/** Runs `decayStage` over every live item in a campaign — what the scheduled cron task calls, one campaign at a time. */
export async function decayCampaignStage(deps: PipelineDeps, campaignId: string, roomId: string, now: Date = new Date()): Promise<DecayStageResult[]> {
  const items = await deps.api.listItems(campaignId);
  const results: DecayStageResult[] = [];
  for (const item of items.filter((entry) => entry.status === "live")) results.push(await decayStage(deps, campaignId, roomId, item, now));
  return results;
}
