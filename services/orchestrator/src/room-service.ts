import { isBandMessage, type BandAgent, type BandMessage } from "@room2store/contracts";
import { BandApiClient, protocolEvent, type BandClient, type BandPeer } from "./band-client.ts";
import { campaignRoles, type BandIdentity, type BandRole } from "./roles.ts";

const roleEmitter: Record<BandRole, BandAgent> = {
  flowCoordinator: "orchestrator",
  roomCataloger: "catalog",
  pricingResearcher: "research",
  priceSetter: "pricing",
  safetyReviewer: "compliance",
  storePublisher: "store",
  salesConcierge: "sales",
  settlementClerk: "finance",
};

export interface CampaignRoomStore {
  assertCampaignExists(campaignId: string): Promise<void>;
  setBandRoom(campaignId: string, roomId: string): Promise<void>;
}

export class RestCampaignRoomStore implements CampaignRoomStore {
  private readonly apiBaseUrl: string;

  constructor(apiBaseUrl = process.env.ROOM2STORE_API_BASE_URL ?? "http://localhost:3000") {
    this.apiBaseUrl = apiBaseUrl;
  }

  async assertCampaignExists(campaignId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl.replace(/\/$/, "")}/campaigns/${encodeURIComponent(campaignId)}`);
    if (response.status === 404) throw new Error(`Campaign ${campaignId} does not exist; refusing to create an orphan Band room`);
    if (!response.ok) throw new Error(`Room2Store API could not verify campaign (${response.status})`);
  }

  async setBandRoom(campaignId: string, roomId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl.replace(/\/$/, "")}/campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bandRoomId: roomId }),
    });
    if (!response.ok) throw new Error(`Room2Store API could not persist Band room (${response.status})`);
  }
}

export interface CampaignRoomBootstrap {
  campaignId: string;
  roomId: string;
  participants: BandPeer[];
}

export interface ProtocolMessageRequest {
  roomId: string;
  role: BandRole;
  message: BandMessage;
  recipients: BandRole[];
}

function uniqueRoles(roles: BandRole[]): BandRole[] {
  return [...new Set(roles)];
}

function protocolContent(message: BandMessage, recipients: BandPeer[]): string {
  const addresses = recipients.map((recipient) => `@${recipient.name}`).join(" ");
  return `${addresses} [ROOM2STORE:${message.name}] ${JSON.stringify(message)}`;
}

export class BandRoomService {
  private readonly clients: Record<BandRole, BandClient>;
  private readonly campaignStore: CampaignRoomStore;

  constructor(
    clients: Record<BandRole, BandClient>,
    campaignStore: CampaignRoomStore,
  ) {
    this.clients = clients;
    this.campaignStore = campaignStore;
  }

  async verifyIdentities(): Promise<Record<BandRole, BandPeer>> {
    const verified = {} as Record<BandRole, BandPeer>;
    for (const [role, client] of Object.entries(this.clients) as [BandRole, BandClient][]) {
      const peer = await client.getMe();
      if (peer.id !== client.identity.agentId) throw new Error(`Band identity mismatch for ${client.identity.name}`);
      verified[role] = peer;
    }
    return verified;
  }

  async createCampaignRoom(campaignId: string): Promise<CampaignRoomBootstrap> {
    await this.campaignStore.assertCampaignExists(campaignId);
    const coordinator = this.clients.flowCoordinator;
    const room = await coordinator.createRoom();

    for (const role of campaignRoles) await coordinator.addParticipant(room.id, this.clients[role].identity.agentId);

    const participants = await coordinator.getParticipants(room.id);
    await this.campaignStore.setBandRoom(campaignId, room.id);

    const recipientPeers = this.peersForRoles(participants, campaignRoles);
    await coordinator.sendMessage(
      room.id,
      `@${recipientPeers.map((peer) => peer.name).join(" @")} Room2Store campaign ${campaignId} is initialized. Await your assigned handoff.`,
      recipientPeers,
    );
    await coordinator.postEvent(room.id, { content: "Room2Store campaign room initialized", messageType: "task", metadata: { campaignId, roomId: room.id } });

    return { campaignId, roomId: room.id, participants };
  }

  async postProtocolMessage(request: ProtocolMessageRequest): Promise<void> {
    const client = this.clients[request.role];
    if (request.message.emitter !== roleEmitter[request.role]) {
      throw new Error(`${request.role} cannot emit a ${request.message.emitter} protocol message`);
    }

    const roles = uniqueRoles([
      ...request.recipients,
      ...(request.role === "flowCoordinator" ? [] : ["flowCoordinator"]),
    ] as BandRole[]).filter((role) => role !== request.role);
    if (roles.length === 0) throw new Error("A Band protocol message needs at least one recipient");

    const participants = await client.getParticipants(request.roomId);
    const recipients = this.peersForRoles(participants, roles);
    await client.sendMessage(request.roomId, protocolContent(request.message, recipients), recipients);
    await client.postEvent(request.roomId, protocolEvent(request.message));
  }

  async readProtocolHistory(roomId: string): Promise<BandMessage[]> {
    const context = await this.clients.flowCoordinator.getContext(roomId);
    const messages: BandMessage[] = [];

    for (const entry of context) {
      const marker = entry.content.indexOf("[ROOM2STORE:");
      if (marker < 0) continue;
      const jsonStart = entry.content.indexOf("{", marker);
      if (jsonStart < 0) continue;
      try {
        const parsed: unknown = JSON.parse(entry.content.slice(jsonStart));
        if (isBandMessage(parsed)) messages.push(parsed);
      } catch {
        // Non-protocol or malformed chat text must never be treated as gate evidence.
      }
    }

    return messages;
  }

  private peersForRoles(participants: BandPeer[], roles: BandRole[]): BandPeer[] {
    return roles.map((role) => {
      const agentId = this.clients[role].identity.agentId;
      const participant = participants.find((peer) => peer.id === agentId);
      if (!participant) throw new Error(`${this.clients[role].identity.name} is not in this Band room`);
      return participant;
    });
  }
}

export function createLiveBandRoomService(
  identities: Record<BandRole, BandIdentity>,
  campaignStore: CampaignRoomStore,
): BandRoomService {
  const clients = {} as Record<BandRole, BandClient>;
  for (const [role, identity] of Object.entries(identities) as [BandRole, BandIdentity][]) clients[role] = new BandApiClient(identity);
  return new BandRoomService(clients, campaignStore);
}
