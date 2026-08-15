import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { isCampaignStatus, isItemStatus, type Campaign, type Item, type Order, type PriceEvidence, type Verdict } from "@room2store/contracts";
import type { ApiRepository } from "./repository.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) throw new Error(`${name} must be a string array`);
  return value;
}

function campaignFromBody(body: unknown): Campaign {
  if (!isRecord(body)) throw new Error("campaign body must be an object");
  const now = new Date().toISOString();
  const status = body.status ?? "ingesting";
  if (!isCampaignStatus(status)) throw new Error("invalid campaign status");
  return {
    id: typeof body.id === "string" ? body.id : randomUUID(), sellerId: string(body.sellerId, "sellerId"), slug: string(body.slug, "slug"),
    status, exclusionList: body.exclusionList === undefined ? [] : stringArray(body.exclusionList, "exclusionList"),
    storeUrl: body.storeUrl === undefined ? undefined : string(body.storeUrl, "storeUrl"),
    sandboxId: body.sandboxId === undefined ? undefined : string(body.sandboxId, "sandboxId"),
    bandRoomId: body.bandRoomId === undefined ? undefined : string(body.bandRoomId, "bandRoomId"),
    createdAt: body.createdAt === undefined ? now : string(body.createdAt, "createdAt"), updatedAt: body.updatedAt === undefined ? now : string(body.updatedAt, "updatedAt"),
  };
}

function itemFromBody(body: unknown, campaignId: string): Item {
  if (!isRecord(body)) throw new Error("item body must be an object");
  const now = new Date().toISOString();
  const status = body.status ?? "draft";
  if (!isItemStatus(status)) throw new Error("invalid item status");
  if (!isRecord(body.attributes)) throw new Error("attributes must be an object");
  return {
    id: typeof body.id === "string" ? body.id : randomUUID(), campaignId, name: string(body.name, "name"), category: string(body.category, "category"),
    attributes: body.attributes as Item["attributes"], condition: string(body.condition, "condition"), conditionNotes: string(body.conditionNotes, "conditionNotes"),
    photoUrls: stringArray(body.photoUrls, "photoUrls"), naivePrice: body.naivePrice === undefined ? undefined : number(body.naivePrice, "naivePrice"),
    measuredPrice: body.measuredPrice === undefined ? undefined : number(body.measuredPrice, "measuredPrice"), floorPrice: body.floorPrice === undefined ? undefined : number(body.floorPrice, "floorPrice"),
    listingV1: body.listingV1 as Item["listingV1"], listingV2: body.listingV2 as Item["listingV2"], status,
    createdAt: body.createdAt === undefined ? now : string(body.createdAt, "createdAt"), updatedAt: body.updatedAt === undefined ? now : string(body.updatedAt, "updatedAt"),
  };
}

function evidenceFromBody(body: unknown, itemId: string): PriceEvidence {
  if (!isRecord(body)) throw new Error("price evidence body must be an object");
  const points = body.pricePoints;
  if (!Array.isArray(points)) throw new Error("pricePoints must be an array");
  return {
    id: typeof body.id === "string" ? body.id : randomUUID(), itemId, studyId: string(body.studyId, "studyId"), sampleSize: number(body.sampleSize, "sampleSize"),
    pricePoints: points as PriceEvidence["pricePoints"], curveFitQuality: number(body.curveFitQuality, "curveFitQuality"),
    recommendedPrice: number(body.recommendedPrice, "recommendedPrice"), floorPrice: number(body.floorPrice, "floorPrice"),
    expectedRevenueBefore: number(body.expectedRevenueBefore, "expectedRevenueBefore"), expectedRevenueAfter: number(body.expectedRevenueAfter, "expectedRevenueAfter"),
    listingDefects: stringArray(body.listingDefects, "listingDefects"), createdAt: body.createdAt === undefined ? new Date().toISOString() : string(body.createdAt, "createdAt"),
  };
}

function verdictFromBody(body: unknown, itemId: string): Verdict {
  if (!isRecord(body)) throw new Error("verdict body must be an object");
  if (body.decision !== "approve" && body.decision !== "veto" && body.decision !== "revise") throw new Error("invalid verdict decision");
  return {
    id: typeof body.id === "string" ? body.id : randomUUID(), itemId, decision: body.decision,
    rulesTriggered: stringArray(body.rulesTriggered, "rulesTriggered"), reason: string(body.reason, "reason"),
    createdAt: body.createdAt === undefined ? new Date().toISOString() : string(body.createdAt, "createdAt"),
  };
}

function orderFromBody(body: unknown): Order {
  if (!isRecord(body)) throw new Error("order body must be an object");
  if (!(["imessage", "rcs", "sms", "web"] as const).includes(body.channel as Order["channel"])) throw new Error("invalid order channel");
  if (!(["pending", "paid", "cancelled", "refunded"] as const).includes(body.status as Order["status"])) throw new Error("invalid order status");
  const now = new Date().toISOString();
  return {
    id: typeof body.id === "string" ? body.id : randomUUID(), itemId: string(body.itemId, "itemId"), buyerHandle: string(body.buyerHandle, "buyerHandle"),
    amount: number(body.amount, "amount"), currency: "USD", channel: body.channel as Order["channel"],
    stripeReference: body.stripeReference === undefined ? undefined : string(body.stripeReference, "stripeReference"), status: body.status as Order["status"],
    createdAt: body.createdAt === undefined ? now : string(body.createdAt, "createdAt"), updatedAt: body.updatedAt === undefined ? now : string(body.updatedAt, "updatedAt"),
  };
}

export function createApp(repository: ApiRepository): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : "internal server error";
    const statusCode = message.includes("must be") || message.includes("invalid") ? 400 : 500;
    reply.status(statusCode).send({ error: message });
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/campaigns", async (request, reply) => {
    const campaign = campaignFromBody(request.body);
    const created = await repository.createCampaign(campaign);
    await repository.addEvent({ campaignId: created.id, type: "campaign.created", payload: { status: created.status } });
    return reply.status(201).send(created);
  });

  app.get<{ Params: { campaignId: string } }>("/campaigns/:campaignId", async (request, reply) => {
    const campaign = await repository.getCampaign(request.params.campaignId);
    return campaign ? campaign : reply.status(404).send({ error: "campaign not found" });
  });

  app.patch<{ Params: { campaignId: string } }>("/campaigns/:campaignId", async (request, reply) => {
    if (!isRecord(request.body)) throw new Error("campaign body must be an object");
    const changes: Partial<Campaign> = { ...request.body } as Partial<Campaign>;
    if (changes.status && !isCampaignStatus(changes.status)) throw new Error("invalid campaign status");
    const campaign = await repository.updateCampaign(request.params.campaignId, changes);
    return campaign ? campaign : reply.status(404).send({ error: "campaign not found" });
  });

  app.get<{ Params: { campaignId: string } }>("/campaigns/:campaignId/items", async (request, reply) => {
    if (!await repository.getCampaign(request.params.campaignId)) return reply.status(404).send({ error: "campaign not found" });
    return repository.listItems(request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string } }>("/campaigns/:campaignId/items", async (request, reply) => {
    const campaign = await repository.getCampaign(request.params.campaignId);
    if (!campaign) return reply.status(404).send({ error: "campaign not found" });
    const item = await repository.createItem(itemFromBody(request.body, campaign.id));
    await repository.addEvent({ campaignId: campaign.id, itemId: item.id, type: "item.created", payload: { status: item.status } });
    return reply.status(201).send(item);
  });

  app.patch<{ Params: { itemId: string } }>("/items/:itemId", async (request, reply) => {
    if (!isRecord(request.body)) throw new Error("item body must be an object");
    const changes = { ...request.body } as Partial<Item>;
    if (changes.status && !isItemStatus(changes.status)) throw new Error("invalid item status");
    const item = await repository.updateItem(request.params.itemId, changes);
    return item ? item : reply.status(404).send({ error: "item not found" });
  });

  app.post<{ Params: { itemId: string } }>("/items/:itemId/price-evidence", async (request, reply) => {
    const evidence = await repository.storePriceEvidence(evidenceFromBody(request.body, request.params.itemId));
    return reply.status(201).send(evidence);
  });

  app.get<{ Params: { itemId: string } }>("/items/:itemId/price-evidence", async (request, reply) => {
    const evidence = await repository.getPriceEvidence(request.params.itemId);
    return evidence ? evidence : reply.status(404).send({ error: "price evidence not found" });
  });

  app.post<{ Params: { itemId: string } }>("/items/:itemId/verdict", async (request, reply) => {
    const verdict = await repository.storeVerdict(verdictFromBody(request.body, request.params.itemId));
    return reply.status(201).send(verdict);
  });

  app.get<{ Params: { itemId: string } }>("/items/:itemId/verdict", async (request, reply) => {
    const verdict = await repository.getVerdict(request.params.itemId);
    return verdict ? verdict : reply.status(404).send({ error: "verdict not found" });
  });

  app.post("/orders", async (request, reply) => {
    const order = await repository.createOrder(orderFromBody(request.body));
    return reply.status(201).send(order);
  });

  app.get<{ Params: { campaignId: string } }>("/campaigns/:campaignId/events", async (request, reply) => {
    if (!await repository.getCampaign(request.params.campaignId)) return reply.status(404).send({ error: "campaign not found" });
    return repository.listEvents(request.params.campaignId);
  });

  app.addHook("onClose", async () => repository.close());
  return app;
}
