import { task } from "@renderinc/sdk/workflows";
import type { Item, Order } from "@room2store/contracts";
import { createLiveBandRoomService, createSandboxManager, GateEngine, loadBandIdentities, RestCampaignRoomStore } from "@room2store/orchestrator";
import { RoomStoreApiClient } from "./api-client.ts";
import { runCampaignPipeline } from "./pipeline.ts";
import { buildStage, catalogStage, complyStage, decayCampaignStage, ingestStage, marketStage, priceStage, sellStage, settleStage, type PipelineDeps } from "./stages.ts";
import { createStageIntegrations } from "./stage-integrations.ts";

/**
 * B9: the actual Render Workflows task registrations — what
 * `render workflows init`'s linked repo build picks up (per
 * docs.render.com/docs/workflows: "You define your tasks as standard
 * TypeScript ... functions and register them with Render" via `task()` from
 * `@renderinc/sdk`; "No additional initialization is required when using
 * the TypeScript SDK"). Each task builds its own live dependencies —
 * Render spins up a fresh instance per run, so nothing here is shared
 * module-level state. Deploying this service (linking this repo, `npm
 * install && npm run build` / `npm start`) is B12's environment-hygiene
 * task; this file is the DAG itself, ready for that deploy.
 *
 * Every task here is a plain `PipelineDeps`-driven call into `stages.ts` /
 * `pipeline.ts` — the same functions `pipeline-cli.ts` and the test suite
 * exercise directly, so "runs under Render" and "runs in this repo's tests"
 * are provably the same code path, not two implementations that can drift.
 */
function buildLiveDeps(): PipelineDeps {
  const sandboxManager = createSandboxManager();
  const roomService = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore(), sandboxManager);
  return { roomService, gateEngine: new GateEngine(roomService), api: new RoomStoreApiClient(), integrations: createStageIntegrations() };
}

export const ingest = task({ name: "ingest", timeoutSeconds: 600 }, async (campaignId: string): Promise<Item[]> => ingestStage(buildLiveDeps(), campaignId));

export const catalog = task(
  { name: "catalog", timeoutSeconds: 300 },
  async (campaignId: string, roomId: string, items: Item[]) => catalogStage(buildLiveDeps(), campaignId, roomId, items),
);

export const price = task(
  { name: "price", timeoutSeconds: 3600, retry: { maxRetries: 2, waitDurationMs: 5000, backoffScaling: 2 } },
  async (campaignId: string, roomId: string, item: Item) => priceStage(buildLiveDeps(), campaignId, roomId, item),
);

export const comply = task(
  { name: "comply", timeoutSeconds: 300 },
  async (campaignId: string, roomId: string, item: Item) => {
    const deps = buildLiveDeps();
    const campaign = await deps.api.getCampaign(campaignId);
    return complyStage(deps, campaignId, roomId, item, campaign);
  },
);

export const build = task(
  { name: "build", timeoutSeconds: 1800 },
  async (campaignId: string, roomId: string, items: Item[]) => buildStage(buildLiveDeps(), campaignId, roomId, items),
);

export const market = task(
  { name: "market", timeoutSeconds: 300 },
  async (campaignId: string, itemIds: string[]) => marketStage(buildLiveDeps(), campaignId, itemIds),
);

export const sell = task(
  { name: "sell", timeoutSeconds: 300 },
  async (campaignId: string, roomId: string, itemId: string, buyerHandle: string, amount: number) => sellStage(buildLiveDeps(), campaignId, roomId, itemId, buyerHandle, amount),
);

export const settle = task(
  { name: "settle", timeoutSeconds: 300 },
  async (campaignId: string, roomId: string, order: Order) => settleStage(buildLiveDeps(), campaignId, roomId, order),
);

/** The DAG's seller-side spine — ingest→catalog→price→comply→build→market — as one Render-triggerable run. */
export const runCampaignPipelineTask = task(
  { name: "runCampaignPipeline", timeoutSeconds: 21600 },
  async (campaignId: string, roomId: string) => runCampaignPipeline(buildLiveDeps(), campaignId, roomId),
);

/**
 * B11: price-decay, triggered on a schedule rather than chained into
 * `runCampaignPipeline`. Render Workflows' `task()` (this file) has no
 * cron/schedule field of its own — confirmed against this repo's installed
 * `@renderinc/sdk`'s `RegisterTaskOptions` (`dist/workflows/types.d.ts`),
 * which only takes `retry`/`timeoutSeconds`/`plan`/`name`. The scheduling
 * primitive lives one level up, in Render's general service API: a
 * `cron_job`-type service with its own `schedule` field (confirmed in the
 * SDK's `dist/generated/schema.d.ts`), separate from a Workflows service.
 * B12 is where that cron_job service actually gets provisioned (same
 * "deploy config" scope as linking this repo as a Workflows service in the
 * first place); what it runs is `decay-cli.ts`, which calls this task
 * remotely via `trigger-client.ts`'s `createRenderWorkflowsClient` — same
 * remote-trigger pattern C's commerce layer uses for `sell`/`settle`.
 */
export const decayCampaign = task(
  { name: "decayCampaign", timeoutSeconds: 900 },
  async (campaignId: string, roomId: string) => decayCampaignStage(buildLiveDeps(), campaignId, roomId),
);
