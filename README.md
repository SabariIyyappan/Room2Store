# Room2Store

Text a photo of something you want to sell. An agent identifies it, prices it,
publishes it to a storefront, negotiates with buyers over iMessage, and settles
the payment — 90% to the seller, 10% to the platform.

**Live:** [storefront](https://room2store-web.onrender.com/store) ·
[API health](https://room2store-perception.onrender.com/health)

---

## How it works

```mermaid
flowchart LR
    S["📱 Seller<br/>texts a photo"]

    subgraph AGENT ["🤖 The agent"]
        direction TB
        ID["👁️ Identify<br/>what is it?"]
        PR["💰 Price<br/>what is it worth?"]
        CK["🛡️ Check<br/>safe to sell?"]
        ID --> PR --> CK
    end

    ST["🏪 Storefront<br/>live, filtered by distance"]
    B["🙋 Buyer<br/>texts the item code"]
    NG["🤝 Negotiate<br/>holds the floor price"]
    PAY["💳 Pay<br/>Stripe checkout"]
    SPLIT["🎉 Sold<br/>90% seller · 10% platform"]

    S --> AGENT --> ST --> B --> NG --> PAY --> SPLIT
    SPLIT -.->|"both texted"| S

    classDef person fill:#EEF2FF,stroke:#6366F1,stroke-width:2px,color:#1E1B4B
    classDef agent fill:#F5F3FF,stroke:#7C3AED,stroke-width:2px,color:#2E1065
    classDef money fill:#ECFDF5,stroke:#10B981,stroke-width:2px,color:#064E3B
    classDef shop fill:#FFF7ED,stroke:#F97316,stroke-width:2px,color:#7C2D12

    class S,B person
    class ID,PR,CK agent
    class PAY,SPLIT money
    class ST,NG shop
```

Everything happens over iMessage. The seller never opens an app; the buyer only
opens the storefront to browse.

## What each piece runs on

```mermaid
flowchart TB
    subgraph EDGE ["👥 People"]
        IM["💬 iMessage<br/>Linq"]
        WEB["🖥️ Storefront<br/>React"]
    end

    subgraph CORE ["⚙️ Room2Store"]
        API["🧠 Perception service<br/>the brain: chat, listings, deals"]
        DB[("🗄️ Postgres<br/>listings, orders, sellers")]
        API <--> DB
    end

    subgraph AI ["✨ Intelligence"]
        GEM["🔮 Gemini<br/>identify + estimate"]
        TER["📊 Terac<br/>price measured on people"]
    end

    MONEY["💳 Stripe<br/>checkout + settlement"]

    IM <--> API
    WEB --> API
    API <--> AI
    API <--> MONEY

    classDef people fill:#EEF2FF,stroke:#6366F1,stroke-width:2px,color:#1E1B4B
    classDef core fill:#F5F3FF,stroke:#7C3AED,stroke-width:2px,color:#2E1065
    classDef ai fill:#FDF4FF,stroke:#D946EF,stroke-width:2px,color:#4A044E
    classDef cash fill:#ECFDF5,stroke:#10B981,stroke-width:2px,color:#064E3B

    class IM,WEB people
    class API,DB core
    class GEM,TER ai
    class MONEY cash
```

## The one idea that matters

A price is either **measured on real people** or it is a **guess** — and the
product never confuses the two.

```mermaid
flowchart LR
    N["🆕 New listing"] --> Q{"📊 Panel<br/>study run?"}
    Q -->|"no"| E["🔮 Gemini estimate<br/>retail × condition"]
    Q -->|"yes, 5+ people"| M["📈 Demand curve<br/>price × probability"]
    Q -->|"fewer than 5"| R["🚫 No price<br/>refuses to fake it"]

    E --> TAG1["🏷️ estimate"]
    M --> TAG2["✅ measured"]

    classDef guess fill:#FFF7ED,stroke:#F97316,stroke-width:2px,color:#7C2D12
    classDef real fill:#ECFDF5,stroke:#10B981,stroke-width:2px,color:#064E3B
    classDef stop fill:#FEF2F2,stroke:#EF4444,stroke-width:2px,color:#7F1D1D
    classDef neutral fill:#F8FAFC,stroke:#64748B,stroke-width:2px,color:#0F172A

    class E,TAG1 guess
    class M,TAG2 real
    class R stop
    class N,Q neutral
```

Condition sets the discount off retail — new 70–85%, excellent 55–70%,
good 40–55%, fair 25–40%. The same speaker is $759 new and $310 fair.

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
