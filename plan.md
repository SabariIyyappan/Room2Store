# ROOM2STORE — Build Plan

**Team:** 3 engineers · **Window:** 24h hackathon · **Goal:** Best Overall Agent-Run Company + Band + Pioneer + Linq + Render + Superserve + Replay

---

## 0. The One-Sentence Spec

> Point your phone at a room. A swarm of agents catalogs every object, runs a **live human pricing study on each item via Terac**, builds and deploys a storefront, sells over iMessage, and settles real money to Stripe.

**The technical claim:** the price is not guessed by an LLM. It is *measured* on real humans, then the demand curve is fit and expected revenue is maximized. Remove Terac and the product cannot price. That is the dependency judges are looking for.

**Non-negotiables (never cut):**
1. One Terac study that produces a real demand curve with a visible before/after.
2. A Band room that *gates* — pricing cannot post a price before research posts evidence; compliance can veto and the deploy actually stops.
3. One real Stripe payment from a real human.

---

## 1. Architecture

### 1.1 System flow

```
                          ┌─────────────────────────────────────┐
                          │        SELLER (phone / web)         │
                          │   30s room video + exclusion rules  │
                          └──────────────────┬──────────────────┘
                                             │ create campaign
                                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        RENDER WORKFLOWS  (the DAG runner)                     │
│   ingest → catalog → price → comply → build → market → sell → settle → decay  │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ every step = a Band message + a DB write
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          BAND ROOM  (coordination bus)                        │
│  catalog · research · pricing · compliance · store · sales · finance          │
│  + runtime specialists spawned per category (electronics, furniture)          │
│                                                                               │
│  GATES ENFORCED HERE:                                                         │
│   • price set        REQUIRES  price evidence present in room                 │
│   • store deploy     REQUIRES  compliance verdict = APPROVE                   │
│   • sale close       REQUIRES  floor price present in room                    │
└───┬─────────────┬──────────────┬──────────────┬──────────────┬───────────────┘
    │             │              │              │              │
    ▼             ▼              ▼              ▼              ▼
┌────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐
│CATALOG │  │ PRICING   │  │COMPLIANCE│  │  STORE    │  │   SALES     │
│        │  │ +RESEARCH │  │          │  │  BUILDER  │  │  +FINANCE   │
│Frames  │  │           │  │Prohibited│  │           │  │             │
│→VLM    │  │ TERAC MCP │  │ items    │  │ Lovable   │  │  LINQ       │
│→GLiNER2│  │  ↕        │  │ Claims   │  │  → GitHub │  │  iMessage   │
│attrs   │  │ 4 price   │  │ Excluded │  │  → Render │  │  App Card   │
│        │  │ points    │  │ objects  │  │           │  │  Agent Pay  │
│        │  │ ↓         │  │ PII scrub│  │ per-camp  │  │  ↓          │
│        │  │ demand    │  │ (GLiGuard│  │ subdomain │  │  STRIPE     │
│        │  │ curve fit │  │  /PII)   │  │           │  │  Checkout   │
│        │  │ ↓         │  │          │  │           │  │             │
│        │  │ best      │  │  VETO ►──┼──┤ blocks    │  │             │
│        │  │ exp. rev. │  │          │  │ deploy    │  │             │
└───┬────┘  └─────┬─────┘  └─────┬────┘  └─────┬─────┘  └──────┬──────┘
    │             │              │             │               │
    └─────────────┴──────────────┴─────────────┴───────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   POSTGRES (source of    │
                    │   truth) + object store  │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   JUDGE DASHBOARD        │
                    │  live demand curves,     │
                    │  V1→V2 lift, Band feed,  │
                    │  revenue counter         │
                    └──────────────────────────┘

ALL heavy execution (frame extraction, VLM calls, browser comps lookup, repo
scaffolding) runs inside a SUPERSERVE SANDBOX — one per campaign, paused
between bursts, resumed instantly when a buyer texts.
```

### 1.2 The pricing loop (the core IP)

```
item ──► naive price guess from comps + VLM        = P0   ← "the before"
   │
   ├──► render 4 listing variants at four price points spanning P0
   │
   ├──► TERAC STUDY A   (General Population, n ≈ 50)
   │      Q1  Would you buy this at this price?      → binary
   │      Q2  Most you would pay?                    → numeric
   │      Q3  What information is missing?           → open text
   │      Q4  Which photo is strongest?              → rank
   │
   ├──► fit a demand curve: probability of purchase as a function of price
   │      expected revenue = price × probability of purchase
   │      pick the price that maximizes expected revenue   ← THE PRICE
   │      pick the price where purchase probability hits 75% ← THE FLOOR
   │
   ├──► cluster Q3 open text → listing defects → rewrite copy → V2
   │
   └──► TERAC STUDY B   (fresh panel, n ≈ 50, V2 at the chosen price)
          measures listing-quality lift with price held constant
                                │
                                ▼
        DASHBOARD SHOWS TWO INDEPENDENT BEFORE/AFTERS
          (a) price:    naive guess vs measured price → Δ expected revenue
          (b) listing:  V1 vs V2 at identical price   → Δ intent, Δ trust
```

The two studies are deliberately separated so the lift claims are clean. Study A changes price and holds copy fixed. Study B changes copy and holds price fixed. Judges can't accuse you of confounding the two.

### 1.3 Repo layout — **ownership is directory-level, so merges never collide**

```
room2store/
├─ packages/
│  └─ contracts/          ★ JOINT — frozen at C0, changes need 3-way agreement
│     ├─ types            shared data shapes
│     ├─ band-protocol    message names + payload shapes
│     └─ fixtures/        golden sample data so everyone works unblocked
│
├─ services/
│  ├─ perception/         ▲ ENGINEER A
│  ├─ pricing/            ▲ ENGINEER A   (owns the Terac MCP client)
│  ├─ orchestrator/       ■ ENGINEER B   (owns the Band client + gates)
│  ├─ compliance/         ■ ENGINEER B
│  ├─ storebuilder/       ■ ENGINEER B
│  ├─ api/                ■ ENGINEER B   (REST + DB schema + migrations)
│  └─ commerce/           ● ENGINEER C   (Linq + Stripe + negotiator)
│
├─ apps/
│  ├─ dashboard/          ● ENGINEER C
│  ├─ seller-web/         ● ENGINEER C   (upload page)
│  └─ store-template/     ■ ENGINEER B
│
├─ workflows/             ■ ENGINEER B   (Render Workflows definitions)
├─ infra/                 ■ ENGINEER B   (Superserve sandbox mgmt, env)
└─ plan.md
```

**Git rule:** one branch per engineer, merge to main only at checkpoints. Nobody edits a directory they don't own. The contracts package is edited only in a joint ten-minute session at C0 and, if truly necessary, once more at C3 — announced in the team channel, all three acknowledge before merge.

---

## 2. Contracts (agree on these FIRST, hour 0)

No implementation, just the shapes everyone codes against.

### 2.1 Core entities

| Entity | Fields | Written by | Read by |
|---|---|---|---|
| **Campaign** | id, seller, slug, status, exclusion list, store URL, sandbox id, Band room id | C creates, B updates | all |
| **Item** | id, campaign, name, category, attributes, condition, condition notes, photos, naive price, measured price, floor price, listing V1, listing V2, status | A creates, B/C update status | all |
| **PriceEvidence** | item, study id, sample size, the measured price/probability points, curve fit quality, recommended price, floor price, expected revenue before vs after, listing defect list | **A only** | B (gate check), C (dashboard) |
| **Verdict** | item, decision (approve / veto / revise), rules triggered, human-readable reason | **B only** | B (deploy gate), C (dashboard) |
| **Contact** | handle, opt-in status, opt-in timestamp, engagement events | **C only** | B (compliance check) |
| **Order** | id, item, buyer handle, amount, channel, Stripe reference, status | **C only** | C (dashboard) |

**Status vocabularies** — agree on these exactly, they appear in every service:

- Campaign: ingesting → pricing → review → live → settling → closed
- Item: draft → studying → priced → *(vetoed)* → live → reserved → sold

### 2.2 Band message protocol — the gate contract

| Message | Emitter | Carries | Gate it satisfies |
|---|---|---|---|
| catalog items ready | catalog | draft item list | unblocks research |
| catalog needs reshoot | furniture specialist | item, reason | **sends A's catalog step back to re-run** |
| research price evidence | research | PriceEvidence | **unblocks the price-set message** |
| price set | pricing | item, price, floor | unblocks compliance and sales |
| compliance verdict | compliance | Verdict | **APPROVE unblocks store deploy** |
| specialist spawn | orchestrator | agent name, item, reason | runtime specialist added |
| store deployed | store | store URL, item list | unblocks marketing |
| sales inquiry / offer | sales | item, buyer, amount | — |
| sales close | sales | Order | **requires floor price present in room** |
| finance paid | finance | order, amount | closes the item |
| gate blocked | orchestrator | attempted transition, missing prerequisite | the visible proof the gates are real |

**How enforcement works:** the orchestrator reads the room's message history before permitting any state transition. If the prerequisite message is absent, it refuses and posts a *gate blocked* message naming what's missing. This is what makes Band load-bearing — delete the room and every transition deadlocks. It is not a display surface, it is the permission system.

### 2.3 Fixtures — the thing that unblocks everyone

At C0 the contracts package ships sample data covering:

- a campaign with three items — office chair, headphones, desk lamp — fully populated
- a structurally exact but fabricated PriceEvidence record, so C can build the dashboard before A's study returns
- an approve verdict and a veto verdict (a car seat — this is the live demo veto)
- fifty synthetic panel responses in Terac's real response shape

Everyone codes against fixtures from minute one. Real services swap in at C3. A dashboard toggle switches between fixture and live mode — this doubles as the demo fallback if the network dies.

---

## 3. Task split

### ▲ ENGINEER A — Perception & Pricing Science
*Owns: perception, pricing, the Terac MCP integration, Pioneer models, the demand curve*

**Why one person:** the Terac loop is the project's entire thesis and has the longest external latency — human panels don't return on your schedule. A never touches infrastructure, so A is never blocked by a broken deploy.

| # | Task | Detail |
|---|---|---|
| A1 | **Terac smoke study — HOUR 0** | Before writing anything else, launch a hand-written study on a hand-made chair listing, General Population, n=50. Measure turnaround time. That number sets the entire schedule. |
| A2 | Video → frames | Keyframe extraction and dedupe inside the Superserve sandbox. Output: 8–15 candidate object crops. |
| A3 | Object detection + exclusion matching | VLM pass producing the object list and bounding boxes, cross-checked against the seller's exclusion list. Output: draft items. |
| A4 | **Pioneer: GLiNER2 attribute extraction** | Structured attributes — brand, model, dimensions, material, condition phrasing — pulled from the VLM caption plus the seller's voice transcript. This is the Pioneer track entry. |
| A5 | Naive price | Comps lookup via browser in the sandbox, blended with a VLM estimate. Deliberately unsophisticated — it is the "before" number and it needs to be honestly naive. |
| A6 | Listing variant renderer | Four price variants plus photo ordering, output as Terac-ready stimulus cards. |
| A7 | **Terac Study A** | Launch through the Terac MCP, poll for completion, normalize responses. |
| A8 | **Demand curve fit** | Fit purchase probability against price, compute expected revenue across the range, take the maximum as the price and the 75%-probability point as the negotiation floor. Include confidence bands so the dashboard chart has error bars — judges notice. |
| A9 | Defect clustering | Cluster the open-text responses into the top three listing defects, feed them into a rewrite, produce listing V2. |
| A10 | **Terac Study B** | Fresh panel, V2 at the chosen price, price held constant. Yields the listing-quality lift. |
| A11 | Emit price evidence and price set | The two Band messages that carry the whole thesis into the rest of the system. |
| A12 | *Stretch:* Pioneer fine-tune | Fine-tune an open model on the accumulated attribute-to-measured-price pairs. Demo line: "item one needed fifty humans, item one thousand needs zero." |

**A's contract to the team:** publishes price evidence to Band and the database. Consumes only a campaign record and a video URL. A can work in total isolation for the first eight hours.

---

### ■ ENGINEER B — Orchestration, Compliance & Infrastructure
*Owns: orchestrator, compliance, store builder, API, workflows, infra, store template*

**Why one person:** B is the integration surface. Everything B builds is a socket the other two plug into, so B front-loads scaffolding and nobody waits.

| # | Task | Detail |
|---|---|---|
| B1 | **Repo + contracts + fixtures — HOUR 0** | Monorepo, shared types, fixture pack, CI. This unblocks A and C immediately and is therefore the highest-priority hour of B's day. |
| B2 | Database schema + REST API | Campaigns, items, studies, price points, listings, verdicts, contacts, offers, orders, events. The endpoints A and C both call. |
| B3 | **Band room bootstrap** | A room per campaign, seven agent identities registered, helpers for posting and reading structured payloads. |
| B4 | **Gate engine** | The heart of the Band track. A transition table that reads room history, refuses transitions missing their prerequisite, and posts a gate-blocked message naming what's missing. Write one test per gate — that test file is the artifact you show judges. |
| B5 | **Runtime specialist spawning** | On catalog completion, inspect categories and spawn an electronics specialist (serial number and stolen-goods check) or a furniture specialist (dimensions check, which can send catalog back for another frame). This satisfies the "specialist added at runtime based on the specific case" criterion literally, and the reshoot path is a real dependency where one agent's output changes because of another's finding. |
| B6 | **Compliance agent** | Rules: prohibited categories (weapons, recalled goods, car seats, medication), unverifiable claims (warranty language, "brand new"), accidental listing of an excluded object, unsafe pickup detail such as an exact home address in public copy, and messaging an opted-out contact. Emits a verdict. **A veto must genuinely block the store builder** — if it doesn't, the Band track claim collapses. |
| B7 | **Pioneer: GLiGuard / GLiNER2-PII** | PII scrubbing on all outbound copy and buyer message logs. Second Pioneer entry, and it's what makes the compliance agent credible rather than decorative. |
| B8 | **Superserve sandbox manager** | One sandbox per campaign. Provision, execute, **pause once the store is deployed**, **resume the moment a buyer texts**. Log every pause and resume to the dashboard so judges see the bursty lifecycle the sponsor built the feature for. |
| B9 | **Render Workflows DAG** | Ingest, catalog, price, comply, build, market, sell, settle. The workflow *is* the pipeline, not a wrapper around it — this is the Render track requirement. |
| B10 | **Store builder** | Lovable-generated storefront template, pushed to a per-campaign GitHub repo, deployed on Render at a per-campaign path. |
| B11 | **Price-decay scheduled workflow** | A cron: item unsold after 24 hours triggers either the learned elasticity or a small Terac re-study, drops the price, and notifies watchers through C's messaging layer. This is the "agent makes hard decisions autonomously" requirement, running unattended. |
| B12 | Environment and deploy hygiene | One environment template, one deploy command, a staging URL live by C2. |

**B's contract:** exposes the REST API, the Band helpers, and the gate engine. B never writes pricing math and never writes buyer-facing copy.

---

### ● ENGINEER C — Commerce, Buyer Surface & Story
*Owns: commerce, dashboard, seller web, Linq, Stripe, Replay, the demo*

**Why one person:** C owns everything a judge actually touches. Two prize tracks live entirely in C's directories — the Linq track, and the real-revenue requirement for Best Agent-Run Company.

| # | Task | Detail |
|---|---|---|
| C0 | **Opt-in buyer pool — HOUR 0** | Walk the room. Get every attendee, mentor, and judge into the contact list with explicit opt-in. *No buyers means no revenue means no Agent-Run Company prize.* This is the highest-leverage thirty minutes anyone on the team spends. |
| C1 | **Stripe individual account — HOUR 0** | Set it up immediately; verification can take hours and it is a hard eligibility requirement. Checkout flows for full purchase, reservation deposit, bundle, and pickup fee. |
| C2 | Seller upload page | Video upload plus a "sell everything except ___" field. Deliberately minimal — this is not where the demo's attention goes. |
| C3 | **Linq outbound and inbound** | Real phone number across iMessage, RCS and SMS. Listings go only to opted-in contacts, and that check is enforced by B's compliance service. Webhook ingestion for every event. |
| C4 | **Linq iMessage App card** ★ | The differentiator most teams will miss. An interactive card rendered in-thread with photo, price, and a state that flips from Reserved to Confirmed. This is what wins the Linq track — budget real time for it, but no more than three hours. |
| C5 | **Agent Pay checkout** | The payment card opens an Apple Pay App Clip and settles to your Stripe account. A sale closes without the buyer ever leaving the blue bubble. |
| C6 | **Negotiator agent** | Bounded by the floor price read from the Band room. Concession ladder, urgency levers such as a discount for same-day pickup, hard refusal below the floor. **If the floor price message is absent from the room it must refuse to negotiate at all** — that's another real Band dependency, not a decorative one. |
| C7 | Engagement telemetry | Delivered, read, clicked, replied, offered, purchased. Feed read receipts and typing indicators into a buyer-intent score and prioritize follow-ups by it. |
| C8 | Find My pickup coordination | Location share for handoff after payment. Cheap to build and it demos beautifully. |
| C9 | **Judge dashboard** ★ | Live demand curve with confidence bands, naive versus measured expected revenue, V1 to V2 listing lift, a streaming Band feed with gates visibly firing, the sandbox pause/resume ticker, and the revenue counter. **This screen is the demo.** Budget accordingly. |
| C10 | **Replay QA pass** | Run against the seller upload path and the buyer checkout path, fix what it finds, capture the clean report. Also file one false positive for the fifty-dollar card. |
| C11 | Demo runbook and rehearsal | Own the script, run it three times against a stopwatch, record the backup video. |

**C's contract:** consumes items, measured price, floor price and price evidence from the database and Band. Produces orders and the payment confirmation.

---

## 4. Checkpoints

Each checkpoint is a merge to main, a ten-minute standup, and a system that is demoable at that state.

### **C0 — Hour 0–1 · Foundation** *(all three together, then split)*
- B: repo, contracts, fixtures, CI, staging URL reserved
- A: **Terac smoke study launched** — the clock starts here
- C: **opt-in buyer pool collected**, Stripe account submitted
- Joint: freeze the contracts package, agree the Band message names and status vocabularies
- **Demoable:** nothing. **What it buys you:** all three can now work four hours without talking.

### **C1 — Hour 4 · Vertical slice on fixtures**
- A: video through to items and a naive price, running on one real recorded room video
- B: Band room live, seven agents registered, one gate passing its test
- C: Linq number live and round-tripping a message; Stripe test-mode checkout works
- **Demoable:** "we can catalog a room and text a human about it"

### **C2 — Hour 8 · First real demand curve** ★
- A: Study A results in, curve fit, price and floor computed from real responses
- B: gate engine visibly refusing a price-set with no evidence in the room
- C: dashboard skeleton rendering A's real curve from the database
- **Demoable:** the thesis. A real price, measured on real humans.
- **If this slips, everything else is decoration — all three converge here until it lands.**

### **C3 — Hour 12 · Live store and live compliance**
- B: Lovable through GitHub through Render working, store live at a real URL, compliance vetoing the car seat
- A: defects clustered, listing V2 generated, Study B launched
- C: iMessage App card rendering in a real thread, negotiator reading its floor from Band
- **Demoable:** end to end with fixtures fully removed. Last chance to amend contracts.

### **C4 — Hour 16 · Real money** ★
- C: **first real Stripe payment from a real human** — via Agent Pay if it's working, web Checkout as the fallback
- B: Render Workflows running the full pipeline, Superserve pause and resume logged
- A: Study B results in, V1 to V2 lift computed
- **Demoable:** Agent-Run Company eligibility is secured. Breathe.

### **C5 — Hour 20 · Polish and QA**
- C: Replay pass run, bugs fixed, clean report captured, one false positive filed
- B: price-decay cron firing, runtime specialist spawning on an electronics item
- A: Pioneer fine-tune if there's room, otherwise a second item fully priced
- Dashboard final: both before/afters legible on one screen from ten feet away
- **Demoable:** the full pitch.

### **C6 — Hour 22 · Freeze**
- **Code freeze.** Demo-path bugfixes only.
- Backup video recorded end to end
- Four genuinely desirable pre-staged items loaded — a spare keyboard, monitor, headphones, lamp
- Three rehearsals against a stopwatch

### **C7 — Hour 23–24 · Demo**

---

## 5. Demo runbook (five minutes, rehearsed)

| t | Beat | Owner |
|---|---|---|
| 0:00 | Record three objects live in front of the judges. "Sell everything except my laptop." | C |
| 0:30 | Freeze frame, objects become glowing boxes, boxes fly into product cards. Band feed starts scrolling. | C |
| 1:00 | Catalog posts three items. The furniture specialist spawns, demands dimensions, and **sends catalog back** — show the retry happening. | B |
| 1:30 | Pricing tries to set a price and is **blocked, awaiting price evidence**. Say it out loud: *"it literally cannot guess."* | B |
| 2:00 | **The demand curve fits live on the dashboard.** Naive $40 becomes measured $32. Expected revenue $7.60 becomes $15.04. | A |
| 2:45 | V1 versus V2 listing lift: trust 48% to 81%, purchase intent 21% to 47%. Same price, better copy, fresh panel. | A |
| 3:15 | Attempt to list a car seat. **Compliance vetoes, deploy halts.** The agents have real authority, not advisory opinions. | B |
| 3:45 | A judge texts the number. The iMessage card renders. "$25?" The negotiator holds the floor and counters "$26 if you pick up today." Card flips to Confirmed. Apple Pay. | C |
| 4:15 | Revenue counter ticks. Sandbox pause/resume ticker visible. | C |
| 4:30 | Final board, then the business slide: storage lien auctions, estate sale firms, property managers, university move-out. | any |

**Final board — and replace the "zero humans" line:**

```
CAMPAIGN AGE               7 MINUTES
ITEMS CATALOGED                    3
HUMANS ON PRICING PANEL          104
LISTINGS VETOED                    1
BUYERS CONTACTED                  12
ITEMS SOLD                         1
REAL REVENUE                   $2.60
```

A pricing panel of 104 beats "zero human employees." You are not claiming humans are obsolete — you are claiming you can **rent human judgment on demand and compile it into a price.** That is a more credible company and a more interesting one.

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| **Terac panel turnaround too slow** | Med | Fatal | Smoke study at hour 0 to measure it. Batch all items into one multi-stimulus study. Have Study B written and ready to fire the instant Study A lands. | A |
| **No buyers, so no revenue** | Med | Fatal to a track | Opt-in pool at hour 0. Pre-stage four genuinely desirable items. Small real revenue beats large fake revenue every time. | C |
| **Stripe verification delay** | Med | Fatal to a track | Submit at hour 0. Test mode for development, live mode for the demo. | C |
| Lovable → GitHub → Render chain flaky | Med | High | Pre-build a static store template so deploy becomes a content swap rather than a generation step if the chain breaks. | B |
| iMessage App card proves fiddly | Med | Med | Fallback is a rich-media message plus a web Checkout link. Hard stop at three hours. | C |
| Contract drift between services | Low | High | Directory ownership, fixture-first development, contracts frozen at C0. | all |
| Demo depends on live network | High | High | Backup video at C6. Fixture-mode toggle in the dashboard. | C |

---

## 7. Cut list — cut early, cut decisively

1. Pioneer fine-tune *(keep GLiNER2 and GLiGuard — those are the cheap track entry)*
2. Price-decay cron *(describe it on a slide instead)*
3. Find My pickup coordination
4. Bundling logic
5. Runtime specialist spawning — **only if the Band gates are otherwise rock solid**, since this is itself a Band criterion; defend it before cutting
6. The second and third items' full pricing loops — one item priced properly beats three priced sloppily

**Never cut:** the Terac loop · the Band gates · one real Stripe payment · the dashboard.

---

## 8. Standing rules

- Standup at every checkpoint. Ten minutes, standing, no laptops.
- Post to the team channel the moment you're blocked. Do not silently work around another engineer's directory.
- About to edit a directory you don't own? Stop, message the owner, let them do it.
- After C4, anything not on the demo path is a distraction.
- C owns the demo script and holds a veto on scope additions after C5.
