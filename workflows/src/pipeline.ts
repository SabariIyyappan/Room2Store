import type { Item, Verdict } from "@room2store/contracts";
import {
  buildStage,
  catalogStage,
  complyStage,
  ingestStage,
  marketStage,
  priceStage,
  type GateStageResult,
  type PipelineDeps,
  type PriceStageResult,
} from "./stages.ts";

/**
 * B9: the autonomous seller-side half of the DAG — ingest through market —
 * the part that runs with no buyer involved. `sellStage`/`settleStage` stay
 * out of this chain deliberately: plan.md's protocol table has "sales
 * inquiry / offer" arriving from a buyer texting (C's Linq layer), so those
 * two are separately-triggered tasks (see `render-tasks.ts`), not links in
 * this chain — chaining them here would mean posting a fabricated buyer
 * message, which is exactly the kind of decorative Band traffic plan.md
 * warns against.
 */
export interface ItemPipelineResult {
  item: Item;
  verdict: Verdict;
  price?: PriceStageResult;
}

export interface CampaignPipelineResult {
  items: ItemPipelineResult[];
  build?: GateStageResult<{ storeUrl: string }>;
  marketed?: { notified: number };
}

export async function runCampaignPipeline(deps: PipelineDeps, campaignId: string, roomId: string): Promise<CampaignPipelineResult> {
  const items = await ingestStage(deps, campaignId);
  await catalogStage(deps, campaignId, roomId, items);

  const results: ItemPipelineResult[] = [];
  for (const item of items) {
    // Comply before price: no point spending a Terac panel on an item that's
    // about to be vetoed. Compliance never depends on a measured price, so
    // it can run the moment catalog clears the item.
    const campaign = await deps.api.getCampaign(campaignId);
    const verdict = await complyStage(deps, campaignId, roomId, item, campaign);
    if (verdict.decision !== "approve") {
      results.push({ item, verdict });
      continue;
    }
    const price = await priceStage(deps, campaignId, roomId, item);
    results.push({ item, verdict, price });
  }

  const approved = results.filter((result) => result.price?.setPrice.allowed).map((result) => result.item);
  if (approved.length === 0) return { items: results };

  const build = await buildStage(deps, campaignId, roomId, approved);
  const marketed = build.allowed ? await marketStage(deps, campaignId, approved.map((item) => item.id)) : undefined;
  return { items: results, build, marketed };
}
