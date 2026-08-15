# Store template

Engineer B owns the reusable campaign storefront template. B10 adds the implementation.

Per plan.md's risk register ("Lovable → GitHub → Render chain flaky... Pre-build a static store template so deploy becomes a content swap rather than a generation step if the chain breaks"), this is that pre-built static template — no build step, no framework, just `index.html` + `style.css` with `{{TOKEN}}` placeholders. `services/storebuilder` fills those tokens per campaign; nothing here is campaign-specific. If a real Lovable-authored design replaces this later, it's a drop-in: `services/storebuilder/src/render-template.ts` only needs the same token names to keep working.

## Tokens

| Token | Filled with |
|---|---|
| `{{CAMPAIGN_TITLE}}` | `campaign.slug`, title-cased |
| `{{ITEM_CARDS}}` | one rendered copy of `item-card.html` per live item |
| `{{ITEM_COUNT}}` | number of items on the page |

`item-card.html`'s own tokens (`{{ITEM_NAME}}`, `{{ITEM_PRICE}}`, `{{ITEM_PHOTO}}`, `{{ITEM_DESCRIPTION}}`) are filled per item — see `render-template.ts` for the precedence it uses to source them from `listingV2`/`listingV1`/raw item fields.
