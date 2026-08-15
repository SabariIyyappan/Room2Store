/**
 * B10: the "Render" leg of the chain — deploys the campaign repo
 * `GitHubRepoPublisher` just pushed to as a Render Static Site, at a
 * per-campaign service (Render gives every service its own
 * `<name>.onrender.com` path, which is the "per-campaign path" plan.md
 * asks for). Verified against api-docs.render.com/reference/create-service
 * and .../list-services: `POST /v1/services` with `type: "static_site"`,
 * and lookup is `GET /v1/services?name=...&type=static_site` returning
 * `{ service, cursor }[]`, not bare service objects.
 */
export interface SiteDeployer {
  /** Ensures a per-campaign static site exists for this repo and returns its live URL. Idempotent — reuses the existing service rather than redeploying a duplicate. */
  ensureSite(campaignId: string, repoUrl: string): Promise<{ storeUrl: string }>;
}

function serviceNameFor(campaignId: string): string {
  return `room2store-${campaignId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

interface RenderServiceEnvelope {
  service: { name: string; url?: string; serviceDetails?: { url?: string } };
}

export class RenderStaticSiteDeployer implements SiteDeployer {
  private readonly apiKey: string;
  private readonly ownerId: string;

  constructor(apiKey: string, ownerId: string) {
    this.apiKey = apiKey;
    this.ownerId = ownerId;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  private urlFrom(envelope: RenderServiceEnvelope): string {
    const url = envelope.service.url ?? envelope.service.serviceDetails?.url;
    if (!url) throw new Error(`Render service ${envelope.service.name} has no published URL yet`);
    return url;
  }

  private async findService(name: string): Promise<RenderServiceEnvelope | undefined> {
    const response = await fetch(`https://api.render.com/v1/services?name=${encodeURIComponent(name)}&type=static_site&ownerId=${encodeURIComponent(this.ownerId)}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`Render service lookup failed (${response.status})`);
    const envelopes = (await response.json()) as RenderServiceEnvelope[];
    return envelopes.find((entry) => entry.service.name === name);
  }

  async ensureSite(campaignId: string, repoUrl: string): Promise<{ storeUrl: string }> {
    const name = serviceNameFor(campaignId);
    const existing = await this.findService(name);
    if (existing) return { storeUrl: this.urlFrom(existing) };

    const response = await fetch("https://api.render.com/v1/services", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        type: "static_site",
        name,
        ownerId: this.ownerId,
        repo: repoUrl,
        branch: "main",
        autoDeploy: "yes",
        serviceDetails: { buildCommand: "", publishPath: "." },
      }),
    });
    if (!response.ok) throw new Error(`Render static site creation failed (${response.status})`);
    return { storeUrl: this.urlFrom((await response.json()) as RenderServiceEnvelope) };
  }
}

/** Local, network-free stand-in — deterministic, so it's what tests and the no-key demo path run against. */
export class LocalSiteDeployer implements SiteDeployer {
  private readonly deployed = new Map<string, string>();

  async ensureSite(campaignId: string, _repoUrl: string): Promise<{ storeUrl: string }> {
    const name = serviceNameFor(campaignId);
    const existing = this.deployed.get(name);
    if (existing) return { storeUrl: existing };
    const storeUrl = `https://${name}.onrender.com`;
    this.deployed.set(name, storeUrl);
    return { storeUrl };
  }
}

/** Picks the live Render deployer when an API key + owner id are configured, else the local fallback. */
export function createSiteDeployer(apiKey = process.env.RENDER_API_KEY, ownerId = process.env.RENDER_OWNER_ID): SiteDeployer {
  if (apiKey && ownerId) return new RenderStaticSiteDeployer(apiKey, ownerId);
  return new LocalSiteDeployer();
}
