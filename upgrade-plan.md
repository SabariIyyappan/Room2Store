# Room2Store — Customer-Led Upgrade Add-On

This is an add-on to `plan.md`, not a replacement. It concentrates the existing sponsor stack into a buyer and seller experience that feels trustworthy rather than merely autonomous.

## The experience promise

> Text Room2Store a photo, approve a clear selling plan, and let it turn the item into a safe, evidence-backed sale without making you chase buyers.

## What customers expect

| Person | Expectation | Add-on that delivers it |
| --- | --- | --- |
| Seller | “Tell me quickly whether this is worth selling.” | Reply within seconds with the identified item, an honest provisional range, confidence, and only the missing detail. Do not wait for research before acknowledging the photo. |
| Seller | “I stay in control.” | A **Sell Brief** to approve before publication: title, condition, photo, provisional range, minimum acceptable price, pickup preference, and excluded details. |
| Seller | “Explain the price; do not make it up.” | A compact **Price Evidence** view: naive price, human-measured recommendation, negotiation floor, panel size, and why the result changed. |
| Seller | “Keep me safe.” | Default to an approximate area and pickup window; reveal exact pickup details only after payment/reservation. Compliance visibly vetoes unsafe copy or prohibited items. |
| Buyer | “Can I trust this listing?” | An iMessage product card with real photos, condition/known defects, price, pickup area, reserve action, and a state that changes from Available → Reserved → Sold. |
| Buyer | “Can I finish quickly?” | Reservation/payment in the same thread; the agent negotiates only inside the seller-approved floor. |

## P0: Seller Control Layer

The system is technically impressive already. Its weak point is that a normal seller may perceive it as a black box. Add one visible control surface before every irreversible step.

### 1. Sell Brief — immediately after a photo

Reply in iMessage:

```
I found: Sony WH-1000XM5 headphones
Condition: Good (please confirm)
Quick range: $180–$230

Before I list it:
• lowest price you will accept?
• pickup: public place / your area / delivery?
• anything buyers should know?
```

Use natural replies or quick actions. If a model number is not visible, ask only for that missing input. Never pretend the item is identified when it is not.

### 2. Publish checkpoint — after Terac returns

```
50 shoppers reviewed this listing.
Suggested price: $198  |  your floor: $175
Why: $225 lowered purchase intent; clearer condition copy raised trust.

Ready to publish to your opted-in buyers?
```

This turns Terac’s human research into a benefit a seller understands rather than an invisible hackathon dependency.

### 3. Buyer Trust Card — the Linq differentiator

Make the iMessage App card the listing itself:

- hero photo plus condition/defect summary
- measured price and “why this price” affordance
- Reserve / Ask a question / Buy actions
- live state: Available → Reserved → Confirmed/Sold
- no exact home address in the card

### 4. Seller rules, not vague autonomy

At intake, offer three simple choices:

- **Sell fast** — prioritize a quicker sale within the measured floor.
- **Get the best price** — wait for stronger demand; never go below the seller’s floor.
- **Ask me first** — draft every counteroffer for approval.

The negotiator follows those rules plus the Band-proven floor; it never invents a discount policy.

## Priority order

| Priority | Add-on | Why it matters | Sponsor / proof |
| --- | --- | --- | --- |
| P0 | Sell Brief with seller approval before publication | Highest customer-trust gain; small surface area | Linq inbound chat + Band approval gate |
| P0 | Measured Price Evidence explanation | Makes Terac’s human research legible and defensible | Terac before/after and real panel size |
| P0 | Buyer Trust Card with changing status | Memorable buyer moment and strongest Linq story | Linq iMessage App + Agent Pay / Stripe |
| P1 | Seller-selected negotiation mode | Makes the agent a concierge, not a wildcard | Band floor gate + Linq offers |
| P1 | Privacy-safe pickup handoff | Prevents the clearest trust failure | Compliance veto + location only after reservation |
| P2 | Item timeline in dashboard | Shows sellers and judges what the agents did | Render workflow + Band feed + Superserve pause/resume |

## Customer-first demo story

1. Seller texts a photo: “sell it for me.”
2. Room2Store responds immediately with the Sell Brief and asks for one missing detail.
3. Seller approves a floor and pickup preference.
4. Terac evidence changes the recommended price; the seller sees the before/after and approves publication.
5. A buyer receives the iMessage Trust Card, reserves, and pays.
6. The card flips to Confirmed; exact pickup coordination happens only then.

Demo claim: **“Room2Store does not merely list your item. It earns the right to sell it by showing its work and preserving your control.”**

## Do not add yet

- More marketplace integrations or public-posting channels
- Bundling, subscriptions, storage auctions, or estate-sale workflows
- Long seller questionnaires
- Fully autonomous discounts without a seller rule
- Any feature that delays the first useful response to a photo

The Terac guidebook has an eight-hour core hacking block and requires real human input through Terac, real revenue for the Agent-Run Company prize, and meaningful—not decorative—use of Linq, Band, and Render. Keep this add-on narrow enough to reinforce those proofs rather than compete with them.
