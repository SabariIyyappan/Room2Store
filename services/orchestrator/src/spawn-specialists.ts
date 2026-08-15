import { randomUUID } from "node:crypto";
import type { Item } from "@room2store/contracts";
import type { BandRoomService } from "./room-service.ts";
import {
  electronicsSerialCheck,
  furnitureDimensionCheck,
  inspectItemForSpecialist,
} from "./specialists.ts";

export interface SpecialistOutcome {
  itemId: string;
  role: "electronicsSpecialist" | "furnitureSpecialist";
  /** True when the specialist's check produced a Band signal (a reshoot request or a flagged note). */
  signaled: boolean;
  reason: string;
}

/**
 * Runs after "catalog items ready". Inspects each item's category, spawns
 * the matching specialist into the room if one applies, and lets that
 * specialist run its check. A furniture item with no dimensions sends
 * catalog back for real — that's the dependency plan.md calls out. An
 * electronics item with no serial number is flagged for the room to see,
 * feeding compliance once B6 exists, but it does not block anything itself.
 */
export async function spawnSpecialistsForCatalog(
  roomService: BandRoomService,
  campaignId: string,
  roomId: string,
  items: Item[],
): Promise<SpecialistOutcome[]> {
  const outcomes: SpecialistOutcome[] = [];

  for (const item of items) {
    const inspection = inspectItemForSpecialist(item);
    if (!inspection) continue;

    await roomService.spawnSpecialist({
      roomId,
      campaignId,
      role: inspection.role,
      itemId: item.id,
      reason: inspection.reason,
      notify: ["roomCataloger"],
    });

    if (inspection.role === "furnitureSpecialist") {
      const check = furnitureDimensionCheck(item);
      if (check.needsReshoot) {
        await roomService.postProtocolMessage({
          roomId,
          role: "furnitureSpecialist",
          recipients: ["roomCataloger"],
          message: {
            id: `reshoot_${randomUUID()}`,
            campaignId,
            emittedAt: new Date().toISOString(),
            emitter: "specialist",
            name: "catalog needs reshoot",
            itemId: item.id,
            reason: check.reason!,
          },
        });
        outcomes.push({ itemId: item.id, role: inspection.role, signaled: true, reason: check.reason! });
        continue;
      }
    }

    if (inspection.role === "electronicsSpecialist") {
      const check = electronicsSerialCheck(item);
      if (check.flagged) {
        await roomService.postSpecialistNote({
          roomId,
          role: "electronicsSpecialist",
          content: check.reason!,
          metadata: { itemId: item.id, campaignId },
        });
        outcomes.push({ itemId: item.id, role: inspection.role, signaled: true, reason: check.reason! });
        continue;
      }
    }

    outcomes.push({ itemId: item.id, role: inspection.role, signaled: false, reason: inspection.reason });
  }

  return outcomes;
}
