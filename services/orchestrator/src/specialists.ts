import type { Item } from "@room2store/contracts";
import type { SpecialistRole } from "./roles.ts";

export interface SpecialistInspection {
  role: SpecialistRole;
  reason: string;
}

const electronicsCategories = new Set(["electronics", "appliance", "appliances"]);
const furnitureCategories = new Set(["furniture"]);

/**
 * Category → specialist mapping. This is the "at runtime, based on the
 * specific case" trigger from plan.md B5: catalog completion is what feeds
 * items through this, one at a time, and only a matching category spawns
 * anyone at all.
 */
export function inspectItemForSpecialist(item: Item): SpecialistInspection | undefined {
  const category = item.category.trim().toLowerCase();

  if (electronicsCategories.has(category)) {
    return {
      role: "electronicsSpecialist",
      reason: `${item.name} is electronics — needs a serial-number and stolen-goods check before it can be trusted.`,
    };
  }

  if (furnitureCategories.has(category)) {
    return {
      role: "furnitureSpecialist",
      reason: `${item.name} is furniture — needs verified dimensions before it can be trusted.`,
    };
  }

  return undefined;
}

export interface DimensionCheck {
  needsReshoot: boolean;
  reason?: string;
}

const dimensionKeys = ["dimensions", "width", "height", "depth"];

/** True if the item's attributes carry no usable dimension data at all. */
export function furnitureDimensionCheck(item: Item): DimensionCheck {
  const hasDimensions = dimensionKeys.some((key) => {
    const value = item.attributes[key];
    return typeof value === "string" ? value.trim().length > 0 : typeof value === "number";
  });

  if (hasDimensions) return { needsReshoot: false };

  return {
    needsReshoot: true,
    reason: `${item.name} has no dimensions in its attributes — send catalog back for a measurement shot.`,
  };
}

export interface SerialCheck {
  flagged: boolean;
  reason?: string;
}

/** True if the item has no captured serial number to run a stolen-goods check against. */
export function electronicsSerialCheck(item: Item): SerialCheck {
  const serialNumber = item.attributes.serialNumber;
  const hasSerial = typeof serialNumber === "string" && serialNumber.trim().length > 0;

  if (hasSerial) return { flagged: false };

  return {
    flagged: true,
    reason: `${item.name} has no captured serial number — cannot clear a stolen-goods check yet.`,
  };
}
