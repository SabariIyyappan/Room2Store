import { randomUUID } from "node:crypto";
import type { BandClient, BandContextMessage, BandEvent, BandPeer, BandRoom } from "./band-client.ts";
import type { BandIdentity } from "./roles.ts";

interface StoredMessage extends BandContextMessage {
  senderId: string;
  mentionIds: string[];
}

interface StoredRoom {
  participants: Set<string>;
  messages: StoredMessage[];
  events: BandEvent[];
}

const toHandle = (name: string): string => name.toLowerCase().replaceAll(" ", "-");

export class InMemoryBandNetwork {
  private readonly peers = new Map<string, BandPeer>();
  private readonly rooms = new Map<string, StoredRoom>();

  register(identity: BandIdentity): void {
    this.peers.set(identity.agentId, { id: identity.agentId, name: identity.name, handle: toHandle(identity.name) });
  }

  createClient(identity: BandIdentity): BandClient {
    this.register(identity);
    return new InMemoryBandClient(identity, this);
  }

  peer(id: string): BandPeer {
    const peer = this.peers.get(id);
    if (!peer) throw new Error(`Unknown peer ${id}`);
    return peer;
  }

  allPeers(): BandPeer[] {
    return [...this.peers.values()];
  }

  createRoom(ownerId: string): BandRoom {
    const room = { id: `room_${randomUUID()}` };
    this.rooms.set(room.id, { participants: new Set([ownerId]), messages: [], events: [] });
    return room;
  }

  addParticipant(roomId: string, participantId: string): void {
    this.room(roomId).participants.add(participantId);
  }

  participants(roomId: string): BandPeer[] {
    return [...this.room(roomId).participants].map((id) => this.peer(id));
  }

  sendMessage(roomId: string, senderId: string, content: string, mentions: BandPeer[]): void {
    const room = this.room(roomId);
    if (!room.participants.has(senderId)) throw new Error("Sender is not a room participant");
    if (mentions.length === 0) throw new Error("Band messages require a mention");
    room.messages.push({ id: `message_${randomUUID()}`, content, senderId, mentionIds: mentions.map((peer) => peer.id), createdAt: new Date().toISOString() });
  }

  postEvent(roomId: string, event: BandEvent): void {
    this.room(roomId).events.push(event);
  }

  context(roomId: string, agentId: string): BandContextMessage[] {
    return this.room(roomId).messages
      .filter((message) => message.senderId === agentId || message.mentionIds.includes(agentId))
      .map(({ id, content, createdAt }) => ({ id, content, createdAt }));
  }

  eventCount(roomId: string): number {
    return this.room(roomId).events.length;
  }

  private room(roomId: string): StoredRoom {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    return room;
  }
}

class InMemoryBandClient implements BandClient {
  readonly identity: BandIdentity;
  private readonly network: InMemoryBandNetwork;

  constructor(identity: BandIdentity, network: InMemoryBandNetwork) {
    this.identity = identity;
    this.network = network;
  }

  async getMe(): Promise<BandPeer> { return this.network.peer(this.identity.agentId); }
  async createRoom(): Promise<BandRoom> { return this.network.createRoom(this.identity.agentId); }
  async listPeers(): Promise<BandPeer[]> { return this.network.allPeers(); }
  async addParticipant(roomId: string, participantId: string): Promise<void> { this.network.addParticipant(roomId, participantId); }
  async getParticipants(roomId: string): Promise<BandPeer[]> { return this.network.participants(roomId); }
  async sendMessage(roomId: string, content: string, mentions: BandPeer[]): Promise<void> { this.network.sendMessage(roomId, this.identity.agentId, content, mentions); }
  async postEvent(roomId: string, event: BandEvent): Promise<void> { this.network.postEvent(roomId, event); }
  async getContext(roomId: string): Promise<BandContextMessage[]> { return this.network.context(roomId, this.identity.agentId); }
}
