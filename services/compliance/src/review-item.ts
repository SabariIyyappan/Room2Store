import type { Campaign, Item, Verdict } from "@room2store/contracts";
import type { BandRoomService } from "@room2store/orchestrator";
import { evaluateItem } from "./evaluate.ts";

/**
 * Evaluates the item and posts the "compliance verdict" protocol message
 * that gate-engine.ts's deployStore transition reads. This is the actual
 * plumbing behind "a veto must genuinely block the store builder" — there
 * is no separate advisory channel, the verdict IS the gate input.
 */
export async function reviewItem(
  roomService: BandRoomService,
  campaignId: string,
  roomId: string,
  item: Item,
  campaign: Campaign,
): Promise<Verdict> {
  const verdict = evaluateItem(item, campaign);

  await roomService.postProtocolMessage({
    roomId,
    role: "safetyReviewer",
    recipients: ["storePublisher"],
    message: {
      id: `msg_${verdict.id}`,
      campaignId,
      emittedAt: verdict.createdAt,
      emitter: "compliance",
      name: "compliance verdict",
      verdict,
    },
  });

  return verdict;
}
