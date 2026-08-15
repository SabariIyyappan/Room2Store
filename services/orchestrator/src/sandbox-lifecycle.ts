import type { BandMessage } from "@room2store/contracts";

export interface SandboxLifecycleIntent {
  action: "pause" | "resume";
  campaignId: string;
  reason: string;
}

/**
 * B8: maps the two frozen Band protocol messages that bookend a campaign's
 * bursty sandbox lifecycle onto a sandbox action — "store deployed" pauses
 * (plan.md B8: "pause once the store is deployed"), "sales inquiry / offer"
 * resumes ("resume the moment a buyer texts"). Every other message is a
 * no-op. Kept as a pure function, separate from `BandRoomService`, so the
 * mapping is unit-testable without a Band network.
 */
export function sandboxLifecycleIntent(message: BandMessage): SandboxLifecycleIntent | null {
  switch (message.name) {
    case "store deployed":
      return { action: "pause", campaignId: message.campaignId, reason: `store deployed at ${message.storeUrl}` };
    case "sales inquiry / offer":
      return { action: "resume", campaignId: message.campaignId, reason: `buyer ${message.buyerHandle} texted about ${message.itemId}` };
    default:
      return null;
  }
}
