import type { BandMessage } from "@room2store/contracts";
import type { BandIdentity } from "./roles.ts";

export interface BandPeer {
  id: string;
  name: string;
  handle: string;
}

export interface BandRoom {
  id: string;
}

export interface BandContextMessage {
  id: string;
  content: string;
  createdAt?: string;
}

export interface BandEvent {
  content: string;
  messageType: "task" | "tool_call" | "tool_result" | "thought" | "error";
  metadata: Record<string, unknown>;
}

export interface BandClient {
  readonly identity: BandIdentity;
  getMe(): Promise<BandPeer>;
  createRoom(): Promise<BandRoom>;
  listPeers(): Promise<BandPeer[]>;
  addParticipant(roomId: string, participantId: string): Promise<void>;
  getParticipants(roomId: string): Promise<BandPeer[]>;
  sendMessage(roomId: string, content: string, mentions: BandPeer[]): Promise<void>;
  postEvent(roomId: string, event: BandEvent): Promise<void>;
  getContext(roomId: string): Promise<BandContextMessage[]>;
}

type Json = Record<string, unknown> | unknown[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapData(value: unknown): unknown {
  return isRecord(value) && "data" in value ? value.data : value;
}

function getString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].length > 0) return value[key];
  }
  return undefined;
}

function peerFrom(value: unknown): BandPeer {
  if (!isRecord(value)) throw new Error("Band returned an invalid participant");
  const id = getString(value, "id", "agent_id", "participant_id");
  const name = getString(value, "name", "display_name");
  const handle = getString(value, "handle", "agent_handle") ?? name;
  if (!id || !name || !handle) throw new Error("Band participant is missing id, name, or handle");
  return { id, name, handle };
}

function listFrom(value: unknown, keys: string[]): unknown[] {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of keys) if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

export class BandApiClient implements BandClient {
  readonly identity: BandIdentity;
  readonly baseUrl: string;

  constructor(identity: BandIdentity, baseUrl = process.env.BAND_API_BASE_URL ?? "https://app.band.ai") {
    this.identity = identity;
    this.baseUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/agent`;
  }

  private async request(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "X-API-Key": this.identity.apiKey,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    if (response.status === 204) return undefined;
    const payload = await response.json().catch(() => undefined) as Json | undefined;
    if (!response.ok) {
      const detail = isRecord(payload) ? getString(payload, "message", "error", "detail") : undefined;
      throw new Error(`Band API ${response.status} ${options.method ?? "GET"} ${path}${detail ? `: ${detail}` : ""}`);
    }
    return payload;
  }

  async getMe(): Promise<BandPeer> {
    return peerFrom(unwrapData(await this.request("/me")));
  }

  async createRoom(): Promise<BandRoom> {
    // The live API rejects an empty body with 422 "Missing field: chat"; the
    // in-memory double never did, which is why this was not caught earlier.
    const payload = unwrapData(await this.request("/chats", { method: "POST", body: JSON.stringify({ chat: {} }) }));
    if (!isRecord(payload)) throw new Error("Band returned an invalid chat room");
    const id = getString(payload, "id", "chat_id");
    if (!id) throw new Error("Band returned a chat room without an id");
    return { id };
  }

  async listPeers(): Promise<BandPeer[]> {
    return listFrom(await this.request("/peers"), ["peers", "items"]).map(peerFrom);
  }

  async addParticipant(roomId: string, participantId: string): Promise<void> {
    await this.request(`/chats/${encodeURIComponent(roomId)}/participants`, {
      method: "POST",
      body: JSON.stringify({ participant: { participant_id: participantId } }),
    });
  }

  async getParticipants(roomId: string): Promise<BandPeer[]> {
    return listFrom(await this.request(`/chats/${encodeURIComponent(roomId)}/participants`), ["participants", "items"]).map(peerFrom);
  }

  async sendMessage(roomId: string, content: string, mentions: BandPeer[]): Promise<void> {
    await this.request(`/chats/${encodeURIComponent(roomId)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        message: {
          content,
          mentions: mentions.map((peer) => ({ id: peer.id, name: peer.name, handle: peer.handle })),
        },
      }),
    });
  }

  async postEvent(roomId: string, event: BandEvent): Promise<void> {
    await this.request(`/chats/${encodeURIComponent(roomId)}/events`, {
      method: "POST",
      body: JSON.stringify({
        event: { content: event.content, message_type: event.messageType, metadata: event.metadata },
      }),
    });
  }

  async getContext(roomId: string): Promise<BandContextMessage[]> {
    return listFrom(await this.request(`/chats/${encodeURIComponent(roomId)}/context`), ["messages", "context"])
      .filter(isRecord)
      .map((message) => {
        const id = getString(message, "id", "message_id") ?? "unknown";
        const content = getString(message, "content") ?? "";
        return { id, content, createdAt: getString(message, "created_at", "createdAt") };
      });
  }
}

export function protocolEvent(message: BandMessage): BandEvent {
  return {
    content: `Room2Store protocol: ${message.name}`,
    messageType: "task",
    metadata: { protocol: message },
  };
}
