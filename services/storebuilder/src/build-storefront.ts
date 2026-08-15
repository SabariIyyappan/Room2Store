import type { Campaign, Item } from "@room2store/contracts";
import { createRepoPublisher, type RepoPublisher } from "./github-publisher.ts";
import { renderStorefront } from "./render-template.ts";
import { createSiteDeployer, type SiteDeployer } from "./site-deployer.ts";

/**
 * B10: the whole "Lovable → GitHub → Render" chain, composed. `workflows`'
 * `buildStage` (B9) calls this directly — same in-repo, no-HTTP-hop pattern
 * as B6's `reviewItem`, since storebuilder is B's own package, not an
 * external socket A/C have yet to fill in.
 */
export interface StorefrontDeploy {
  storeUrl: string;
  repoUrl: string;
}

export interface StorebuilderDeps {
  publisher: RepoPublisher;
  deployer: SiteDeployer;
}

export function createStorebuilderDeps(): StorebuilderDeps {
  return { publisher: createRepoPublisher(), deployer: createSiteDeployer() };
}

export async function buildStorefront(campaign: Campaign, items: Item[], deps: StorebuilderDeps = createStorebuilderDeps()): Promise<StorefrontDeploy> {
  const { files } = await renderStorefront(campaign, items);
  const { repoUrl } = await deps.publisher.publish(campaign.id, files);
  const { storeUrl } = await deps.deployer.ensureSite(campaign.id, repoUrl);
  return { storeUrl, repoUrl };
}
