import { randomUUID } from "node:crypto";
import type { BandMessage } from "@room2store/contracts";
import type { BandRole } from "./roles.ts";

export const gateTransitions = ["startResearch", "setPrice", "deployStore", "closeSale", "recordPayment"] as const;
export type GateTransition = (typeof gateTransitions)[number];

export interface GateRoom {
  readProtocolHistory(roomId: string): Promise<BandMessage[]>;
  postProtocolMessage(request: {
    roomId: string;
    role: "flowCoordinator";
    message: Extract<BandMessage, { name: "gate blocked" }>;
    recipients: BandRole[];
  }): Promise<void>;
}

export interface GateRequest {
  transition: GateTransition;
  campaignId: string;
  roomId: string;
  itemId?: string;
  itemIds?: string[];
  orderId?: string;
}

export interface GateAllowed { allowed: true; transition: GateTransition; }
export interface GateBlocked { allowed: false; transition: GateTransition; missingPrerequisites: string[]; }
export type GateResult = GateAllowed | GateBlocked;

const blockedRecipients: Record<GateTransition, BandRole[]> = {
  startResearch: ["pricingResearcher"],
  setPrice: ["priceSetter"],
  deployStore: ["storePublisher"],
  closeSale: ["salesConcierge"],
  recordPayment: ["settlementClerk"],
};

function messagesForCampaign(messages: BandMessage[], campaignId: string): BandMessage[] {
  return messages.filter((message) => message.campaignId === campaignId);
}

function itemRequired(request: GateRequest): string {
  if (!request.itemId) throw new Error(`${request.transition} requires an itemId`);
  return request.itemId;
}

function itemListRequired(request: GateRequest): string[] {
  if (!request.itemIds || request.itemIds.length === 0) throw new Error(`${request.transition} requires one or more itemIds`);
  return request.itemIds;
}

function missingPrerequisites(request: GateRequest, messages: BandMessage[]): string[] {
  const campaignMessages = messagesForCampaign(messages, request.campaignId);

  switch (request.transition) {
    case "startResearch": {
      const itemId = itemRequired(request);
      // B5: a furniture specialist's reshoot request supersedes any earlier
      // "catalog items ready" for that item. Research stays blocked until a
      // fresh "catalog items ready" (posted after the reshoot) clears it.
      const catalogSignals = campaignMessages
        .filter(
          (message): message is Extract<BandMessage, { name: "catalog items ready" } | { name: "catalog needs reshoot" }> =>
            (message.name === "catalog items ready" && message.itemIds.includes(itemId)) ||
            (message.name === "catalog needs reshoot" && message.itemId === itemId),
        )
        .sort((a, b) => a.emittedAt.localeCompare(b.emittedAt));
      const latest = catalogSignals.at(-1);
      if (!latest) return ["catalog items ready"];
      return latest.name === "catalog needs reshoot" ? ["catalog items ready after reshoot"] : [];
    }
    case "setPrice": {
      const itemId = itemRequired(request);
      return campaignMessages.some((message) => message.name === "research price evidence" && message.evidence.itemId === itemId) ? [] : ["research price evidence"];
    }
    case "deployStore": {
      return itemListRequired(request).flatMap((itemId) => {
        const latestVerdict = campaignMessages.filter(
          (message): message is Extract<BandMessage, { name: "compliance verdict" }> => message.name === "compliance verdict" && message.verdict.itemId === itemId,
        ).at(-1);
        return latestVerdict?.verdict.decision === "approve" ? [] : [`compliance verdict = APPROVE for ${itemId}`];
      });
    }
    case "closeSale": {
      const itemId = itemRequired(request);
      return campaignMessages.some((message) => message.name === "price set" && message.itemId === itemId && Number.isFinite(message.floor)) ? [] : ["price set with floor price"];
    }
    case "recordPayment": {
      if (!request.orderId) throw new Error("recordPayment requires an orderId");
      return campaignMessages.some((message) => message.name === "sales close" && message.order.id === request.orderId) ? [] : ["sales close for order"];
    }
  }
}

export class GateEngine {
  private readonly room: GateRoom;

  constructor(room: GateRoom) { this.room = room; }

  async evaluate(request: GateRequest): Promise<GateResult> {
    const missing = missingPrerequisites(request, await this.room.readProtocolHistory(request.roomId));
    if (missing.length === 0) return { allowed: true, transition: request.transition };

    const blocked: Extract<BandMessage, { name: "gate blocked" }> = {
      id: `gate_${randomUUID()}`, campaignId: request.campaignId, emittedAt: new Date().toISOString(), emitter: "orchestrator",
      name: "gate blocked", attemptedTransition: request.transition, missingPrerequisite: missing.join("; "), itemId: request.itemId,
    };
    await this.room.postProtocolMessage({ roomId: request.roomId, role: "flowCoordinator", message: blocked, recipients: blockedRecipients[request.transition] });
    return { allowed: false, transition: request.transition, missingPrerequisites: missing };
  }

  async run<T>(request: GateRequest, transition: () => Promise<T>): Promise<{ gate: GateResult; value?: T }> {
    const gate = await this.evaluate(request);
    if (!gate.allowed) return { gate };
    return { gate, value: await transition() };
  }
}
