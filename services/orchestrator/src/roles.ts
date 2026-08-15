export const bandRoles = [
  "flowCoordinator",
  "roomCataloger",
  "pricingResearcher",
  "priceSetter",
  "safetyReviewer",
  "storePublisher",
  "salesConcierge",
  "settlementClerk",
] as const;

export type BandRole = (typeof bandRoles)[number];

export const roleNames: Record<BandRole, string> = {
  flowCoordinator: "Flow Coordinator",
  roomCataloger: "Room Cataloger",
  pricingResearcher: "Pricing Researcher",
  priceSetter: "Price Setter",
  safetyReviewer: "Safety Reviewer",
  storePublisher: "Store Publisher",
  salesConcierge: "Sales Concierge",
  settlementClerk: "Settlement Clerk",
};

export const campaignRoles = bandRoles.filter((role) => role !== "flowCoordinator");

export interface BandIdentity {
  role: BandRole;
  name: string;
  agentId: string;
  apiKey: string;
}

const envPrefixes: Record<BandRole, string> = {
  flowCoordinator: "BAND_FLOW_COORDINATOR",
  roomCataloger: "BAND_ROOM_CATALOGER",
  pricingResearcher: "BAND_PRICING_RESEARCHER",
  priceSetter: "BAND_PRICE_SETTER",
  safetyReviewer: "BAND_SAFETY_REVIEWER",
  storePublisher: "BAND_STORE_PUBLISHER",
  salesConcierge: "BAND_SALES_CONCIERGE",
  settlementClerk: "BAND_SETTLEMENT_CLERK",
};

export function loadBandIdentities(env: NodeJS.ProcessEnv = process.env): Record<BandRole, BandIdentity> {
  const identities = {} as Record<BandRole, BandIdentity>;

  for (const role of bandRoles) {
    const prefix = envPrefixes[role];
    const agentId = env[`${prefix}_AGENT_ID`];
    const apiKey = env[`${prefix}_API_KEY`];
    if (!agentId || !apiKey) throw new Error(`Missing Band credentials for ${roleNames[role]}`);
    identities[role] = { role, name: roleNames[role], agentId, apiKey };
  }

  return identities;
}
