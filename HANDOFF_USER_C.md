# User C — Handoff Report

**Session date:** 2026-08-15
**Owner:** User C (udarshreddy.marthala@gmail.com)
**Repo:** https://github.com/SabariIyyappan/Room2Store
**Branch:** `main` @ `b854359`
**Test status:** 45/45 passing (`npm test` from repo root)

---

## 1. What ships in this session

| ID | Task | Files | State | Proof |
|----|------|-------|-------|-------|
| T7 | Judge-facing React/Vite frontend | `services/web/**` | **Done, merged to main** | `npm run build` = 2385 modules, 606 KB bundle, no errors |
| T8 | Env-driven CORS on perception | `services/perception/src/server.mjs`, `services/perception/test/cors.test.mjs` | **Done, merged to main** | 4 new tests pass; total suite 45/45 |
| T9 | Terac resale marketplace pricing study (n=5) | Terac opportunity `gd6hergw1sdvi8i61gb6cnao` | **Done, 5/5 approved** | Median WTP $575, trimmed mean $510, min-seen median $350. Recommendation: list $549, accept $450 |

Commits on `main`:
- `0d0aec5` — feat(web) merge feat/web-frontend
- `b854359` — feat(perception) CORS + board updates

---

## 2. Full board — what exists, done, pending

### Done
- **T0** Multi-agent coordination protocol (`AGENTS.md`, `tasks.md`, `status.md`)
- **T1** Photo-ID web flow baseline (`services/perception`)
- **T2** Linq inbound webhook (signed, deduped, tested end-to-end)
- **T4** Photo → real product recognition (Pioneer chain, MODEL_UNKNOWN fallback)
- **T7** Web frontend (User C)
- **T8** CORS (User C)
- **T9** Terac pricing study (User C)

### In progress
- **T5** Listing/pricing/compliance — verdict gate live; **comps lookup** (`compsQuery`) and **Terac study wiring** remain. Owner: Claude.
- **T6** Customer-led upgrade add-on plan — read-only analysis. Owner: Codex.

### Blocked (needs operator, not code)
- **T3** Public endpoint + Linq subscription
  - Deployed at `https://room2store-perception.onrender.com`, `/health` = 200.
  - **BLOCKER:** operator must create `message.received` subscription in Linq dashboard, paste `whsec_...` secret into Render env `LINQ_WEBHOOK_SECRET`.
  - Also set `PIONEER_API_KEY` in Render env (currently demo fallback for vision).

### New follow-ups discovered this session
- **F1** Wire `services/web` mocks (`src/data/mock.ts`) to real endpoints: `POST /api/identify`, `POST /api/items/:id/confirm`, Terac results feed.
- **F2** Add `services/web` static-site block to `render.yaml` for deploy.
- **F3** Once web deployed, add its origin to Render env `CORS_ORIGINS`.
- **F4** Engineer B's `feature/engineer-b-foundation` branch deletes 73 files from current main (-2586 lines). Do NOT merge as-is — needs rebase onto latest main, or cherry-pick only new files.

---

## 3. Starting from a new machine — full setup

### 3.1 System prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 (for `--env-file-if-exists` flag) | `brew install node@20` or nvm |
| npm | comes with Node | — |
| git | any recent | `brew install git` |
| gh CLI | optional, for PRs | `brew install gh` |
| Claude Code CLI | for MCP + agent use | `npm i -g @anthropic-ai/claude-code` |

### 3.2 Clone + install

```bash
git clone https://github.com/SabariIyyappan/Room2Store.git
cd Room2Store
npm install                    # root — currently only test runner
cd services/web && npm install # web frontend deps (176 pkgs, ~19s)
cd ../..
```

### 3.3 Environment variables (secrets — NEVER commit)

Create `.env` at repo root:

```bash
# Perception + Linq webhook
LINQ_API_KEY=<from Linq dashboard>
LINQ_API_URL=https://api.linq.gg/v3
LINQ_WEBHOOK_SECRET=whsec_<from Linq dashboard subscription>

# Pioneer vision (real product recognition)
PIONEER_API_KEY=pio_sk_<from Pioneer console>
PIONEER_BASE_URL=https://api.pioneer.ai

# Optional — CORS allowlist (defaults cover local dev if unset)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Server port (default 3000)
PORT=3000
```

Web frontend needs no env vars today (all mocked). When wired:
- `services/web/.env`: `VITE_API_URL=http://localhost:3000` (or Render URL in prod)

### 3.4 MCP servers used this session (Claude Code)

Configure in `~/.claude/mcp_servers.json` or via `claude mcp add`:

| MCP | Purpose | Auth | Session usage |
|-----|---------|------|---------------|
| **Terac** | Human participant recruitment, pricing studies | OAuth via Terac | T9 study creation + submission fetch |
| **Stripe** | Payments (real settlement, plan section 4) | Stripe API key | **Not yet used**, required for plan non-negotiable #3 (one real payment) |
| **Gmail / Google Drive / Notion / Calendar** | Available in Claude, not used this session | Google OAuth | — |
| **claude-mem** | Persistent memory across sessions | Local | Read prior chair-pricing session context |

Verify with `claude mcp list`. Terac must show connected before running any Terac tool.

### 3.5 Run each service locally

**Perception (webhook + photo ID + verdict):**
```bash
npm run dev:perception
# -> http://localhost:3000/health = {"status":"ok"}
# -> serves seller UI at /
# -> POST /api/identify, /webhooks/linq, /api/items/:id/confirm
```

**Web frontend (judge-facing):**
```bash
cd services/web && npm run dev
# -> http://localhost:5173
```

**Tests (from repo root):**
```bash
npm test
# -> 45 passing across services/perception + services/compliance
```

### 3.6 Deployment (already live for perception)

- Perception: Render blueprint from `render.yaml`. URL: `https://room2store-perception.onrender.com`.
- Web: **not deployed yet** — needs static-site block added to `render.yaml` (F2).
- Once web is on Render, add its origin to perception's `CORS_ORIGINS` env var in Render dashboard.

---

## 4. Testing evidence

### 4.1 Perception + compliance (Node test runner)
```
npm test
# tests 45 — pass 45 — fail 0
```
Suites: catalog, catalog-vision, cors (new, +4), linq, sessions, vision, webhook (end-to-end against stub Linq + Pioneer), verdict.

### 4.2 Web build
```
cd services/web && npm run build
# ✓ 2385 modules transformed
# dist/index.html                  0.71 kB
# dist/assets/index-*.css         18.33 kB (gzip 4.54)
# dist/assets/index-*.js         606.20 kB (gzip 176.57)
# ✓ built in 4.79s
```
No TypeScript errors. Only warnings: recharts v2 deprecation, chunk > 500 KB.

### 4.3 Terac study
- Opportunity: `gd6hergw1sdvi8i61gb6cnao`
- Submissions: 6 total (5 approved, 1 screened out)
- Dashboard: https://terac.com/room2store-msurquuz/default-project-zuuzbguucqxl5dcbh6fhivq0/opportunities/gd6hergw1sdvi8i61gb6cnao/submissions

### 4.4 What is NOT tested
- Web ↔ backend integration (still mocked)
- CORS against real deployed Render origin (only tested locally with stubs)
- Pioneer real API path (no `PIONEER_API_KEY` at test time)
- Linq real webhook (no `LINQ_WEBHOOK_SECRET` at test time)
- Stripe payment path (Stripe MCP available, not wired into service)

---

## 5. Files owned by User C (touch = coordinate)

- `services/web/**` — entire React/Vite frontend
- CORS block in `services/perception/src/server.mjs` (lines around `corsAllowlist` + `corsHeadersFor`)
- `services/perception/test/cors.test.mjs`
- Terac study `gd6hergw1sdvi8i61gb6cnao` (do not delete — has 5 paid submissions)

---

## 6. Handoff — pick up next

**Claude:** T5 comps + Terac wiring (use T9 study pattern), unblock T3 once operator provides Linq secret.

**Engineer B:** rebase `feature/engineer-b-foundation` on current main. Current diff would wipe A + C work.

**Codex:** T6 add-on plan; also good candidate to do F1 (wire web to real endpoints) if Codex claims `services/web/src/data/mock.ts`.

**Operator (Sabari or whoever holds accounts):**
1. Create Linq `message.received` subscription, paste secret into Render `LINQ_WEBHOOK_SECRET`.
2. Set `PIONEER_API_KEY` in Render.
3. Provide Stripe keys when ready to wire payment (plan non-negotiable #3).

---

## 7. Session-local artifacts (NOT in this repo)

The following exists on User C's local machine, in `/Users/m.udarshreddy/Downloads/Room2Store-main/imessage-terac-bridge/`, and is **NOT part of Room2Store**:

- `watch.py` — polls `~/Library/Messages/chat.db`, dispatches allowlisted senders to `claude -p`, replies via AppleScript.
- `allowlist.txt`, `run.sh`, `SETUP.md`.

Blocked at setup: needs macOS Full Disk Access for Terminal to read `chat.db`. Keep or discard per operator's call. Not needed for Room2Store product.
