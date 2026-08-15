# Room2Store

Room2Store turns a room video into a compliance-gated storefront whose prices
are measured with live human research.

## Workspace

- `packages/contracts` — shared entities, statuses, Band messages, and fixtures
- `services/*` — independently owned backend services
- `apps/*` — independently owned web applications
- `workflows` — Render workflow definitions
- `infra` — infrastructure and environment configuration

## Local checks

```powershell
pnpm.cmd install
pnpm.cmd typecheck
pnpm.cmd test
```

Copy `.env.example` to `.env` and fill only the integrations needed for your
local task. Never commit secrets.
