import type { Id, Order, PriceEvidence, Verdict } from "./entities.ts";

export const bandMessageNames = [
  "catalog items ready",
  "catalog needs reshoot",
  "research price evidence",
  "price set",
  "compliance verdict",
  "specialist spawn",
  "store deployed",
  "sales inquiry / offer",
  "sales close",
  "finance paid",
  "gate blocked",
] as const;

export type BandMessageName = (typeof bandMessageNames)[number];
export type BandAgent =
  | "catalog"
  | "research"
  | "pricing"
  | "compliance"
  | "store"
  | "sales"
  | "finance"
  | "orchestrator"
  | "specialist";

interface BandMessageBase {
  id: Id;
  campaignId: Id;
  emittedAt: string;
  emitter: BandAgent;
}

export type BandMessage =
  | (BandMessageBase & { name: "catalog items ready"; itemIds: Id[] })
  | (BandMessageBase & { name: "catalog needs reshoot"; itemId: Id; reason: string })
  | (BandMessageBase & { name: "research price evidence"; evidence: PriceEvidence })
  | (BandMessageBase & { name: "price set"; itemId: Id; price: number; floor: number })
  | (BandMessageBase & { name: "compliance verdict"; verdict: Verdict })
  | (BandMessageBase & { name: "specialist spawn"; agentName: string; itemId: Id; reason: string })
  | (BandMessageBase & { name: "store deployed"; storeUrl: string; itemIds: Id[] })
  | (BandMessageBase & { name: "sales inquiry / offer"; itemId: Id; buyerHandle: string; amount: number })
  | (BandMessageBase & { name: "sales close"; order: Order })
  | (BandMessageBase & { name: "finance paid"; orderId: Id; amount: number })
  | (BandMessageBase & {
      name: "gate blocked";
      attemptedTransition: string;
      missingPrerequisite: string;
      itemId?: Id;
    });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasBaseFields(value: Record<string, unknown>): boolean {
  return ["id", "campaignId", "emittedAt", "emitter", "name"].every(
    (key) => typeof value[key] === "string",
  );
}

export function isBandMessage(value: unknown): value is BandMessage {
  if (!isRecord(value) || !hasBaseFields(value) || !bandMessageNames.includes(value.name as BandMessageName)) {
    return false;
  }

  switch (value.name) {
    case "catalog items ready":
    case "store deployed":
      return Array.isArray(value.itemIds) && value.itemIds.every((id) => typeof id === "string");
    case "catalog needs reshoot":
    case "specialist spawn":
      return typeof value.itemId === "string" && typeof value.reason === "string";
    case "research price evidence":
      return isRecord(value.evidence) && typeof value.evidence.itemId === "string";
    case "price set":
      return typeof value.itemId === "string" && typeof value.price === "number" && typeof value.floor === "number";
    case "compliance verdict":
      return isRecord(value.verdict) && typeof value.verdict.itemId === "string" && typeof value.verdict.decision === "string";
    case "sales inquiry / offer":
      return typeof value.itemId === "string" && typeof value.buyerHandle === "string" && typeof value.amount === "number";
    case "sales close":
      return isRecord(value.order) && typeof value.order.id === "string";
    case "finance paid":
      return typeof value.orderId === "string" && typeof value.amount === "number";
    case "gate blocked":
      return typeof value.attemptedTransition === "string" && typeof value.missingPrerequisite === "string";
  }

  return false;
}

export function assertBandMessage(value: unknown): asserts value is BandMessage {
  if (!isBandMessage(value)) {
    throw new Error("Invalid Band message payload");
  }
}
