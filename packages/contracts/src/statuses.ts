export const campaignStatuses = [
  "ingesting",
  "pricing",
  "review",
  "live",
  "settling",
  "closed",
] as const;

export type CampaignStatus = (typeof campaignStatuses)[number];

export const itemStatuses = [
  "draft",
  "studying",
  "priced",
  "vetoed",
  "live",
  "reserved",
  "sold",
] as const;

export type ItemStatus = (typeof itemStatuses)[number];

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && campaignStatuses.includes(value as CampaignStatus);
}

export function isItemStatus(value: unknown): value is ItemStatus {
  return typeof value === "string" && itemStatuses.includes(value as ItemStatus);
}
