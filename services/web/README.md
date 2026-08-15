# ROOM2STORE Web

Judge-facing frontend for ROOM2STORE — an agent-run marketplace that catalogs a room, prices each item on real humans via Terac, and sells over iMessage. This app contains the seller upload flow, the setup progress view, the live agent-orchestration dashboard, and an eBay-style buyer storefront. All data is mocked in `src/data/mock.ts` for demo purposes.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Routes

- `/` — seller upload page
- `/dashboard/:campaignId/setup` — animated agent setup flow
- `/dashboard/:campaignId` — live dashboard (demand curve, V1/V2 lift, Band feed, sandbox status)
- `/store/:slug` — public buyer storefront (eBay-style layout)

## Stack

React 18 + TypeScript + Vite + Tailwind CSS + shadcn-style UI primitives + Recharts + lucide-react + React Router.
