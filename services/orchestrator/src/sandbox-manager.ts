import { Sandbox, type SandboxInfo } from "@superserve/sdk";

/**
 * B8 — Superserve sandbox manager. One Firecracker microVM sandbox per
 * campaign: provisioned once, paused the moment the store deploys (the
 * campaign goes quiet — no more frame extraction, VLM calls, or repo
 * scaffolding to run), and resumed the instant a buyer texts (plan.md §1.1:
 * "ALL heavy execution ... runs inside a SUPERSERVE SANDBOX ... paused
 * between bursts, resumed instantly when a buyer texts"). Every transition
 * is returned as a `SandboxLifecycleEvent` so the caller can log it to the
 * dashboard's Band feed — see `sandbox-lifecycle.ts` and
 * `BandRoomService.postSandboxEvent`.
 */

export type SandboxLifecycleAction = "provisioned" | "paused" | "resumed";

export interface SandboxLifecycleEvent {
  campaignId: string;
  sandboxId: string;
  action: SandboxLifecycleAction;
  reason: string;
  at: string;
}

export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SandboxManager {
  /** Ensures a sandbox exists for this campaign. Idempotent — reuses an existing one rather than creating a duplicate. */
  provision(campaignId: string): Promise<SandboxLifecycleEvent>;
  /** Runs a command inside the campaign's sandbox, provisioning it first if needed. */
  execute(campaignId: string, command: string): Promise<SandboxExecResult>;
  /** Pause the campaign's sandbox — called the moment the store deploys. */
  pause(campaignId: string, reason: string): Promise<SandboxLifecycleEvent>;
  /** Resume the campaign's sandbox — called the moment a buyer texts. */
  resume(campaignId: string, reason: string): Promise<SandboxLifecycleEvent>;
}

function event(campaignId: string, sandboxId: string, action: SandboxLifecycleAction, reason: string): SandboxLifecycleEvent {
  return { campaignId, sandboxId, action, reason, at: new Date().toISOString() };
}

/**
 * Real integration: the `@superserve/sdk` TypeScript SDK
 * (docs.superserve.ai/sdk-reference/sandbox). One sandbox per campaign,
 * found by the `campaignId` metadata tag set at creation and looked up via
 * `Sandbox.list({ metadata })` — a control-plane call that never wakes a
 * paused sandbox, unlike `Sandbox.connect()`, which always activates.
 *
 * `resume()`/`pause()` check the sandbox's current `status` first so the
 * logged reason is accurate (`connect()` transparently resumes a paused
 * sandbox on its own, so calling `.resume()` on an already-active instance
 * would throw a ConflictError).
 */
export class SuperserveSandboxManager implements SandboxManager {
  private readonly apiKey: string;
  private readonly baseUrl: string | undefined;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private connectionOptions(): { apiKey: string; baseUrl?: string } {
    return this.baseUrl ? { apiKey: this.apiKey, baseUrl: this.baseUrl } : { apiKey: this.apiKey };
  }

  private async findSandbox(campaignId: string): Promise<SandboxInfo | undefined> {
    const sandboxes = await Sandbox.list({ metadata: { campaignId }, ...this.connectionOptions() });
    return sandboxes.find((sandbox) => sandbox.metadata.campaignId === campaignId);
  }

  private async createSandbox(campaignId: string): Promise<SandboxInfo> {
    const sandbox = await Sandbox.create({
      name: `room2store-${campaignId}`,
      metadata: { campaignId },
      ...this.connectionOptions(),
    });
    return sandbox.getInfo();
  }

  async provision(campaignId: string): Promise<SandboxLifecycleEvent> {
    const existing = await this.findSandbox(campaignId);
    if (existing) return event(campaignId, existing.id, "provisioned", "sandbox already provisioned");
    const created = await this.createSandbox(campaignId);
    return event(campaignId, created.id, "provisioned", "sandbox created");
  }

  async execute(campaignId: string, command: string): Promise<SandboxExecResult> {
    const info = (await this.findSandbox(campaignId)) ?? (await this.createSandbox(campaignId));
    // Sandbox.connect() transparently resumes a paused sandbox before handing back a live instance.
    const sandbox = await Sandbox.connect(info.id, this.connectionOptions());
    return sandbox.commands.run(command);
  }

  async pause(campaignId: string, reason: string): Promise<SandboxLifecycleEvent> {
    const info = await this.findSandbox(campaignId);
    if (!info) throw new Error(`No Superserve sandbox provisioned for campaign ${campaignId}`);
    if (info.status === "paused") return event(campaignId, info.id, "paused", `${reason} (already paused)`);
    const sandbox = await Sandbox.connect(info.id, this.connectionOptions());
    await sandbox.pause();
    return event(campaignId, info.id, "paused", reason);
  }

  async resume(campaignId: string, reason: string): Promise<SandboxLifecycleEvent> {
    const info = await this.findSandbox(campaignId);
    if (!info) throw new Error(`No Superserve sandbox provisioned for campaign ${campaignId}`);
    const wasPaused = info.status === "paused";
    // connect() itself performs the resume; calling .resume() afterward would double-resume an active sandbox.
    await Sandbox.connect(info.id, this.connectionOptions());
    return event(campaignId, info.id, "resumed", wasPaused ? reason : `${reason} (sandbox was already active)`);
  }
}

interface LocalSandboxRecord {
  id: string;
  status: "active" | "paused";
}

/**
 * Local, network-free stand-in — deterministic and dependency-free, so it's
 * what tests run against and what the demo falls back to if
 * `SUPERSERVE_API_KEY` isn't configured (same fixture-mode fallback pattern
 * as B7's `LocalPiiModelClient`).
 */
export class LocalSandboxManager implements SandboxManager {
  private readonly sandboxes = new Map<string, LocalSandboxRecord>();

  async provision(campaignId: string): Promise<SandboxLifecycleEvent> {
    const existing = this.sandboxes.get(campaignId);
    if (existing) return event(campaignId, existing.id, "provisioned", "sandbox already provisioned");
    const record: LocalSandboxRecord = { id: `local-sandbox-${campaignId}`, status: "active" };
    this.sandboxes.set(campaignId, record);
    return event(campaignId, record.id, "provisioned", "sandbox created");
  }

  async execute(campaignId: string, command: string): Promise<SandboxExecResult> {
    if (!this.sandboxes.has(campaignId)) await this.provision(campaignId);
    const record = this.mustGet(campaignId);
    record.status = "active";
    return { stdout: `[local-sandbox ${record.id}] ran: ${command}`, stderr: "", exitCode: 0 };
  }

  async pause(campaignId: string, reason: string): Promise<SandboxLifecycleEvent> {
    const record = this.mustGet(campaignId);
    const alreadyPaused = record.status === "paused";
    record.status = "paused";
    return event(campaignId, record.id, "paused", alreadyPaused ? `${reason} (already paused)` : reason);
  }

  async resume(campaignId: string, reason: string): Promise<SandboxLifecycleEvent> {
    const record = this.mustGet(campaignId);
    const wasPaused = record.status === "paused";
    record.status = "active";
    return event(campaignId, record.id, "resumed", wasPaused ? reason : `${reason} (sandbox was already active)`);
  }

  private mustGet(campaignId: string): LocalSandboxRecord {
    const record = this.sandboxes.get(campaignId);
    if (!record) throw new Error(`No Superserve sandbox provisioned for campaign ${campaignId}`);
    return record;
  }
}

/** Picks the live Superserve sandbox manager when an API key is configured, else the local fallback. */
export function createSandboxManager(
  apiKey = process.env.SUPERSERVE_API_KEY,
  baseUrl = process.env.SUPERSERVE_BASE_URL,
): SandboxManager {
  if (apiKey) return new SuperserveSandboxManager(apiKey, baseUrl);
  return new LocalSandboxManager();
}
