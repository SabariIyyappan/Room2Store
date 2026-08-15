# Store builder service

Engineer B owns campaign storefront generation and deployment — plan.md's "Lovable-generated storefront template, pushed to a per-campaign GitHub repo, deployed on Render at a per-campaign path" (B10).

## Layout

- `src/render-template.ts` — fills `apps/store-template`'s tokens with one campaign's data (title, item cards sourced from `listingV2` > `listingV1` > raw item fields).
- `src/github-publisher.ts` — `RepoPublisher`: `GitHubRepoPublisher` (real GitHub Contents API — one repo per campaign, created idempotently) vs `LocalRepoPublisher` (in-memory, no network — same duality as B7/B8/B9's other sponsor clients).
- `src/site-deployer.ts` — `SiteDeployer`: `RenderStaticSiteDeployer` (real Render API — `POST/GET /v1/services`, `type: "static_site"`) vs `LocalSiteDeployer` (synthetic `*.onrender.com` URL).
- `src/build-storefront.ts` — `buildStorefront(campaign, items)` composes the three: render → publish → deploy. This is what `workflows`' `buildStage` (B9) calls directly.
- `src/build-cli.ts` (`pnpm storebuilder:build -- <campaign-id>`) — runs the chain against the live REST API.

## Configuration

`GITHUB_TOKEN` + `GITHUB_OWNER` (repo owner) and `RENDER_API_KEY` + `RENDER_OWNER_ID` (Render workspace id) in `.env`. Either pair missing falls back to the local, network-free implementation, so the DAG (and its tests) never depend on live GitHub/Render access.

Per plan.md's risk register, `apps/store-template` is a pre-built static template rather than something generated per campaign through Lovable at runtime — the mitigation for "Lovable → GitHub → Render chain flaky" is exactly this: deploy is a content swap, not a generation step. Swapping in a real Lovable-authored design later only requires keeping the same `{{TOKEN}}` names.
