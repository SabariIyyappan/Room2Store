# Room2Store

Text a photo of something you want to sell. An agent identifies it, prices it,
publishes it to a storefront, negotiates with buyers over iMessage, and settles
the payment — 90% to the seller, 10% to the platform.

**Live:** [storefront](https://room2store-web.onrender.com/store) ·
[API health](https://room2store-perception.onrender.com/health)

---

## The seller's journey

```mermaid
sequenceDiagram
    autonumber
    actor S as Seller
    participant L as Linq (iMessage)
    participant P as Perception service
    participant G as Gemini vision
    participant C as Compliance
    participant DB as Postgres

    S->>L: photo of an item
    L->>P: signed message.received webhook
    P-->>L: "Got it — looking at your photo now."
    Note over P: webhook answered before the slow call,<br/>so Linq never times out and redelivers
    P->>G: identify the product
    G-->>P: name, brand, model number, confidence
    P-->>S: "Looks like a used QSC PA speaker.<br/>What condition is it in?"
    S->>P: "fair"
    P-->>S: "What ZIP code is it in for pickup?"
    S->>P: "95134"
    P->>C: prohibited? excluded? unsafe?
    alt vetoed
        C-->>P: veto
        P-->>S: "I cannot list this, and why"
    else approved
        P->>DB: publish listing, mint code R2S-XXXX
        P-->>S: "Your listing is live" + price
    end
```

## The buyer's journey

```mermaid
sequenceDiagram
    autonumber
    actor B as Buyer
    participant P as Perception service
    actor S as Seller
    participant ST as Stripe

    B->>P: "R2S-GNVD" (from the storefront button)
    P-->>B: item, condition, asking price
    B->>P: "would you take 110?"
    Note over P: offer checked against the measured floor
    P-->>B: "The lowest I can go is $118."
    B->>P: "yes"
    P-->>S: "You have a buyer — $118"
    alt seller counters
        S->>P: "130"
        P-->>B: "The seller countered at $130"
    else seller accepts
        S->>P: "YES"
        P-->>S: "Send the pickup address and a time"
        S->>P: "500 Howard St, tomorrow 6pm"
        P->>ST: create Checkout Session
        ST-->>P: payment link
        P-->>B: pickup details + pay here
        B->>ST: pays
        ST->>P: checkout.session.completed (signed)
        P-->>B: "Paid — it is yours"
        P-->>S: "Sold. You receive 90%: $106.20"
    end
```

## How pricing works

The product's claim is that a price is **measured on people, not guessed**.
Both paths exist, and they are never labelled the same way.

```mermaid
flowchart LR
    A[New listing] --> B{Terac study<br/>linked?}
    B -->|no| C[Gemini estimate<br/>from retail x condition]
    C --> D["priceStatus: estimated<br/>'a market estimate,<br/>not measured on a panel yet'"]
    B -->|yes| E[Fetch approved<br/>panel submissions]
    E --> F{n >= 5?}
    F -->|no| G[Refuse to price<br/>rather than fake confidence]
    F -->|yes| H[Fit demand curve]
    H --> I["price = argmax(price x P buy)<br/>floor = highest price 75% still pay"]
    I --> J["priceStatus: measured<br/>'measured on 52 people'"]
    D --> K[Listing is sellable]
    J --> K
```

Condition drives the estimate against retail: new 70–85%, excellent 55–70%,
good 40–55%, fair 25–40%. Tech leans to the bottom of its band, durable goods
to the top. The same speaker prices at $759 new and $310 fair.

## System

```mermaid
flowchart TB
    subgraph Buyers & sellers
        IM[iMessage / RCS]
        WEB[Storefront<br/>React + Vite]
    end

    subgraph Room2Store
        PERC[Perception service<br/>Node, no framework]
        COMP[Compliance<br/>veto gate]
        ORCH[Orchestrator<br/>Band rooms + gate engine]
        DAG[Workflows DAG]
    end

    subgraph External
        LINQ[Linq API]
        GEM[Gemini]
        TER[Terac panel]
        STR[Stripe]
        PG[(Postgres)]
    end

    IM <--> LINQ <--> PERC
    WEB -->|GET /api/listings| PERC
    PERC --> GEM
    PERC --> COMP
    PERC <--> PG
    TER -->|submission.approved| PERC
    STR -->|checkout.session.completed| PERC
    PERC --> STR
    DAG -->|POST /ingest, /study| PERC
    ORCH --- DAG
```

Every inbound webhook is signature-verified and fails closed: Linq, Terac and
Stripe all reject an unsigned or replayed request with 401.

## Services

| Path | What it does |
| --- | --- |
| `services/perception` | Linq webhook, vision, listings, deals, Stripe, Terac |
| `services/compliance` | Prohibited categories, unverifiable claims, PII |
| `services/orchestrator` | Band rooms, gate engine, runtime specialists |
| `services/api` | REST API and Postgres schema |
| `services/web` | Buyer storefront |
| `workflows` | Render Workflows DAG and price decay |
| `packages/contracts` | Shared entities, Band protocol, fixtures |

## Running it

```bash
pnpm install
pnpm typecheck          # all six workspace packages
npm test                # 146 tests
npm run dev:perception  # reads .env
```

Diagnostics: `npm run linq:verify -- <url>`, `npm run gemini:models`,
`npm run pioneer:probe`.

## Honest limits

- **Sellers are not paid automatically.** Single Stripe account: the platform
  collects the full amount and the 90/10 split is recorded on the order as a
  ledger, settled out of band. Stripe Connect would change this and needs
  per-seller identity verification.
- **Stripe runs in test mode.** Real card numbers are rejected; use
  `4242 4242 4242 4242`.
- **Band agents authenticate but do not answer.** All eight are registered as
  external, so Band is a message bus rather than a runtime — our services post
  under those identities. The gates that read room history are real either way.
- **In-flight negotiations live in memory** and are lost on redeploy. Published
  listings, orders and sellers are in Postgres and survive.
