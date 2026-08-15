# Workflows

Engineer B owns the Render Workflows DAG (`@renderinc/sdk`) — the actual pipeline, not a wrapper around it.

## Layout

- `src/stages.ts` — the eight stages from plan.md §3 (ingest, catalog, price, comply, build, market, sell, settle) as plain, dependency-injected functions. Each one drives a real `GateEngine` transition and posts the real Band protocol message that unblocks the next stage.
- `src/pipeline.ts` — `runCampaignPipeline`, the autonomous seller-side chain (ingest→catalog→price→comply→build→market). `sell`/`settle` stay independently triggerable — they fire off a real buyer event (Linq/C), not a scheduled step.
- `src/render-tasks.ts` — the real `task()` registrations from `@renderinc/sdk` that Render's build picks up once this repo is linked as a workflow service (B12). Thin wrappers over `stages.ts`/`pipeline.ts` — same code path as the tests and the CLI.
- `src/stage-integrations.ts` — the sockets for A's perception/pricing and C's commerce, plus B10's store builder: calls `*_SERVICE_URL` when configured, else falls back to `@room2store/contracts/fixtures`.
- `src/api-client.ts` — REST client for `services/api` (durable state).
- `src/trigger-client.ts` — triggers a deployed task run remotely via `@renderinc/sdk`'s `WorkflowsClient` (for C's buyer-driven `sell`/`settle` calls once this is deployed).
- `src/pipeline-cli.ts` (`pnpm workflow:demo -- <campaign-id> <room-id>`) — runs the DAG locally against the live Band room + live API, no Render deploy required.

## What's still fixture-backed

`PERCEPTION_SERVICE_URL`, `PRICING_SERVICE_URL`, `COMMERCE_SERVICE_URL`, `STOREBUILDER_SERVICE_URL` are all unset until A/C/B10 ship those services — see `.env.example`. Until then the DAG runs against `@room2store/contracts/fixtures`, and setting a URL swaps in the real service with no DAG code changes.

Deploying this package as an actual Render Workflow service (`render workflows init`, linking this repo, `RENDER_API_KEY`) is B12's environment/deploy-hygiene task.
