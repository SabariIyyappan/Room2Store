import type { CampaignStatus, ItemStatus } from "./statuses.ts";

export type Id = string;
export type IsoDateTime = string;
export type CurrencyCode = "USD";

export interface Campaign {
  id: Id;
  sellerId: Id;
  slug: string;
  status: CampaignStatus;
  exclusionList: string[];
  storeUrl?: string;
  sandboxId?: string;
  bandRoomId?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Listing {
  title: string;
  description: string;
  photoUrls: string[];
  publicCopy: string;
}

export interface Item {
  id: Id;
  campaignId: Id;
  name: string;
  category: string;
  attributes: Record<string, string | number | boolean>;
  condition: string;
  conditionNotes: string;
  photoUrls: string[];
  naivePrice?: number;
  measuredPrice?: number;
  floorPrice?: number;
  listingV1?: Listing;
  listingV2?: Listing;
  status: ItemStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface PricePoint {
  price: number;
  purchaseProbability: number;
  expectedRevenue: number;
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
}

export interface PriceEvidence {
  id: Id;
  itemId: Id;
  studyId: Id;
  sampleSize: number;
  pricePoints: PricePoint[];
  curveFitQuality: number;
  recommendedPrice: number;
  floorPrice: number;
  expectedRevenueBefore: number;
  expectedRevenueAfter: number;
  listingDefects: string[];
  createdAt: IsoDateTime;
}

export type VerdictDecision = "approve" | "veto" | "revise";

export interface Verdict {
  id: Id;
  itemId: Id;
  decision: VerdictDecision;
  rulesTriggered: string[];
  reason: string;
  createdAt: IsoDateTime;
}

export interface Contact {
  id: Id;
  handle: string;
  optedIn: boolean;
  optedInAt?: IsoDateTime;
  engagementEvents: EngagementEvent[];
}

export interface EngagementEvent {
  type: "delivered" | "read" | "clicked" | "replied" | "offered" | "purchased";
  occurredAt: IsoDateTime;
  metadata?: Record<string, string | number | boolean>;
}

export interface Order {
  id: Id;
  itemId: Id;
  buyerHandle: string;
  amount: number;
  currency: CurrencyCode;
  channel: "imessage" | "rcs" | "sms" | "web";
  stripeReference?: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TeracPanelResponse {
  respondentId: string;
  wouldBuy: boolean;
  maximumWillingnessToPay: number;
  missingInformation: string;
  strongestPhotoRank: number;
}
