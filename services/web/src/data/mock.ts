export type Item = {
  id: string;
  name: string;
  category: string;
  condition: string;
  conditionNotes: string;
  image: string;
  naivePrice: number;
  measuredPrice: number;
  floorPrice: number;
  status: "draft" | "studying" | "priced" | "live" | "reserved" | "sold";
  buyersVerified: number;
  freeLocalPickup: boolean;
  soldOverride?: boolean;
};

export type Campaign = {
  id: string;
  slug: string;
  seller: string;
  location: string;
  storeName: string;
  status: "ingesting" | "pricing" | "review" | "live" | "settling" | "closed";
  sellerRating: string;
  positive: string;
};

export type DemandPoint = {
  price: number;
  probability: number;
  expectedRevenue: number;
  lower: number;
  upper: number;
};

export type ListingMetric = {
  label: string;
  v1: number;
  v2: number;
};

export type FeedMessage = {
  id: string;
  ts: string;
  agent: string;
  kind: "info" | "gate" | "success" | "warning" | "veto";
  text: string;
};

export type BuyerEvent = {
  id: string;
  ts: string;
  handle: string;
  action: string;
  item?: string;
};

export const campaign: Campaign = {
  id: "cmp_9b2f",
  slug: "alex-brooklyn-move",
  seller: "Alex",
  location: "Brooklyn, NY",
  storeName: "Alex's Move-Out Sale",
  status: "live",
  sellerRating: "4.9",
  positive: "100%",
};

export const items: Item[] = [
  {
    id: "itm_chair",
    name: "Herman Miller-style Ergonomic Office Chair",
    category: "Furniture",
    condition: "Used - Excellent",
    conditionNotes: "Light wear on armrests, all mechanisms fully functional.",
    image:
      "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=800&auto=format&fit=crop",
    naivePrice: 180,
    measuredPrice: 145,
    floorPrice: 118,
    status: "live",
    buyersVerified: 52,
    freeLocalPickup: true,
  },
  {
    id: "itm_headphones",
    name: "Sony WH-1000XM4 Wireless Noise-Cancelling Headphones",
    category: "Electronics",
    condition: "Used - Like New",
    conditionNotes: "Original box, cable, and travel case included.",
    image:
      "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&auto=format&fit=crop",
    naivePrice: 220,
    measuredPrice: 165,
    floorPrice: 140,
    status: "reserved",
    buyersVerified: 48,
    freeLocalPickup: true,
  },
  {
    id: "itm_lamp",
    name: "IKEA Tertial Adjustable Desk Lamp",
    category: "Home",
    condition: "Used - Good",
    conditionNotes: "Small scuff on base, clamp works perfectly.",
    image:
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop",
    naivePrice: 25,
    measuredPrice: 18,
    floorPrice: 14,
    status: "sold",
    buyersVerified: 41,
    freeLocalPickup: true,
    soldOverride: true,
  },
];

function logistic(x: number, mid: number, k: number) {
  return 1 / (1 + Math.exp(k * (x - mid)));
}

export const demandCurve: DemandPoint[] = Array.from({ length: 20 }, (_, i) => {
  const price = 60 + i * 12;
  const p = logistic(price, 145, 0.035);
  const spread = 0.06;
  return {
    price,
    probability: +(p * 100).toFixed(1),
    expectedRevenue: +(price * p).toFixed(2),
    lower: +Math.max(0, (p - spread) * 100).toFixed(1),
    upper: +Math.min(1, (p + spread) * 100).toFixed(1),
  };
});

export const listingMetrics: ListingMetric[] = [
  { label: "Purchase intent", v1: 21, v2: 47 },
  { label: "Trust score", v1: 48, v2: 81 },
  { label: "Info completeness", v1: 55, v2: 89 },
  { label: "Photo strength", v1: 62, v2: 78 },
];

export const feedMessages: FeedMessage[] = [
  { id: "f1", ts: "14:02:11", agent: "catalog", kind: "info", text: "Extracted 12 candidate frames from room video." },
  { id: "f2", ts: "14:02:34", agent: "catalog", kind: "success", text: "3 items detected: chair, headphones, desk lamp." },
  { id: "f3", ts: "14:02:41", agent: "orchestrator", kind: "info", text: "Spawning furniture specialist for Ergonomic Office Chair." },
  { id: "f4", ts: "14:02:58", agent: "furniture", kind: "warning", text: "Requesting reshoot: dimensions unclear on chair base." },
  { id: "f5", ts: "14:03:22", agent: "pricing", kind: "gate", text: "GATE BLOCKED: price-set requires research price-evidence in room." },
  { id: "f6", ts: "14:03:45", agent: "research", kind: "info", text: "Terac Study A launched · n=52 · General Population." },
  { id: "f7", ts: "14:05:12", agent: "research", kind: "success", text: "Study A complete · 52 respondents · fit R²=0.94." },
  { id: "f8", ts: "14:05:14", agent: "pricing", kind: "success", text: "Price set: $145 · floor $118 (E[rev] max)." },
  { id: "f9", ts: "14:05:20", agent: "compliance", kind: "success", text: "Verdict APPROVE · no prohibited categories detected." },
  { id: "f10", ts: "14:05:33", agent: "store", kind: "success", text: "Storefront deployed → alex-brooklyn-move.room2store.app" },
  { id: "f11", ts: "14:06:01", agent: "research", kind: "info", text: "Terac Study B launched · V2 copy at $145 · n=50." },
  { id: "f12", ts: "14:07:48", agent: "research", kind: "success", text: "Lift measured: intent +26pt, trust +33pt." },
  { id: "f13", ts: "14:08:12", agent: "sales", kind: "info", text: "Buyer @jamie.k viewed headphones (dwell 42s)." },
  { id: "f14", ts: "14:08:41", agent: "sales", kind: "success", text: "Offer accepted: Sony WH-1000XM4 → $158 (above floor)." },
  { id: "f15", ts: "14:09:03", agent: "finance", kind: "success", text: "Stripe payment settled · $158.00 · order_A93X." },
];

export const buyerEvents: BuyerEvent[] = [
  { id: "b1", ts: "14:07:22", handle: "@morgan.p", action: "viewed", item: "Ergonomic Office Chair" },
  { id: "b2", ts: "14:07:45", handle: "@jamie.k", action: "viewed", item: "Sony WH-1000XM4" },
  { id: "b3", ts: "14:08:03", handle: "@jamie.k", action: "asked question", item: "Sony WH-1000XM4" },
  { id: "b4", ts: "14:08:19", handle: "@sam.r", action: "reserved", item: "Ergonomic Office Chair" },
  { id: "b5", ts: "14:08:31", handle: "@jamie.k", action: "offered $150", item: "Sony WH-1000XM4" },
  { id: "b6", ts: "14:08:41", handle: "@jamie.k", action: "purchased", item: "Sony WH-1000XM4" },
  { id: "b7", ts: "14:09:14", handle: "@priya.n", action: "viewed", item: "IKEA Tertial Desk Lamp" },
  { id: "b8", ts: "14:09:38", handle: "@priya.n", action: "purchased", item: "IKEA Tertial Desk Lamp" },
];

export const setupSteps = [
  {
    key: "ingest",
    title: "Ingesting room video",
    detail: "Extracting keyframes and deduplicating candidate objects.",
    durationMs: 2200,
  },
  {
    key: "catalog",
    title: "Cataloging items",
    detail: "VLM identifying 3 sellable objects, cross-checking exclusions.",
    durationMs: 2600,
  },
  {
    key: "research",
    title: "Running Terac pricing study",
    detail: "Panel of 52 humans grading price points on each item.",
    durationMs: 3400,
  },
  {
    key: "comply",
    title: "Compliance review",
    detail: "Scanning for prohibited categories and PII in listing copy.",
    durationMs: 1800,
  },
  {
    key: "deploy",
    title: "Deploying storefront",
    detail: "Publishing to alex-brooklyn-move.room2store.app",
    durationMs: 1600,
  },
] as const;
