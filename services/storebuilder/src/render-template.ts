import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Campaign, Item, Listing } from "@room2store/contracts";

/**
 * B10: fills `apps/store-template`'s `{{TOKEN}}` placeholders with one
 * campaign's data. Resolved relative to this file (not `process.cwd()`) so
 * it works the same whether it's run via `pnpm storebuilder:build`, from
 * `workflows`' `buildStage`, or from a test.
 */
const templateDir = fileURLToPath(new URL("../../../apps/store-template/", import.meta.url));

async function readTemplate(name: string): Promise<string> {
  return readFile(`${templateDir}${name}`, "utf8");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function titleCase(slug: string): string {
  return slug.split(/[-_\s]+/).filter(Boolean).map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ");
}

/** listingV2 (post-defect-rewrite copy) wins if present, then listingV1, then raw item fields as a last resort. */
function listingFor(item: Item): Pick<Listing, "title" | "description" | "photoUrls"> {
  const listing = item.listingV2 ?? item.listingV1;
  if (listing) return listing;
  return { title: item.name, description: item.conditionNotes || `${item.condition} condition.`, photoUrls: item.photoUrls };
}

function priceLabel(item: Item): string {
  const price = item.measuredPrice ?? item.naivePrice;
  return typeof price === "number" ? `$${price.toFixed(0)}` : "Price coming soon";
}

function renderItemCard(cardTemplate: string, item: Item): string {
  const listing = listingFor(item);
  const photo = listing.photoUrls[0] ?? "";
  return cardTemplate
    .replaceAll("{{ITEM_NAME}}", escapeHtml(listing.title))
    .replaceAll("{{ITEM_PRICE}}", escapeHtml(priceLabel(item)))
    .replaceAll("{{ITEM_PHOTO}}", escapeHtml(photo))
    .replaceAll("{{ITEM_DESCRIPTION}}", escapeHtml(listing.description));
}

export interface RenderedSite {
  files: Record<string, string>;
}

/** Produces the exact file set `RepoPublisher.publish` pushes — no other module needs to know the template's token names. */
export async function renderStorefront(campaign: Campaign, items: Item[]): Promise<RenderedSite> {
  const [indexTemplate, cardTemplate, style] = await Promise.all([readTemplate("index.html"), readTemplate("item-card.html"), readTemplate("style.css")]);

  const cards = items.map((item) => renderItemCard(cardTemplate, item)).join("\n");
  const index = indexTemplate
    .replaceAll("{{CAMPAIGN_TITLE}}", escapeHtml(titleCase(campaign.slug)))
    .replaceAll("{{ITEM_COUNT}}", String(items.length))
    .replaceAll("{{ITEM_CARDS}}", cards);

  return { files: { "index.html": index, "style.css": style } };
}
