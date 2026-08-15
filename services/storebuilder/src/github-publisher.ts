/**
 * B10: the "GitHub" leg of plan.md's "Lovable-generated storefront
 * template, pushed to a per-campaign GitHub repo, deployed on Render at a
 * per-campaign path". One repo per campaign, created idempotently, its
 * rendered files pushed via the plain GitHub REST API (Contents API) —
 * no octokit dependency needed for three small text files.
 */
export interface RepoPublisher {
  /** Ensures a per-campaign repo exists and contains exactly these files. Idempotent — safe to call again after a re-catalog or a copy edit. */
  publish(campaignId: string, files: Record<string, string>): Promise<{ repoUrl: string }>;
}

function repoNameFor(campaignId: string): string {
  return `room2store-${campaignId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

interface GitHubContentsResponse {
  sha: string;
}

/**
 * Real integration: api.github.com's REST v3 Contents API
 * (`GET/PUT /repos/{owner}/{repo}/contents/{path}`) plus `POST /user/repos`
 * to create the repo the first time. `auto_init: true` on creation gives
 * the repo an initial commit/default branch immediately, so the very next
 * PUT can go straight to writing files instead of bootstrapping a branch.
 */
export class GitHubRepoPublisher implements RepoPublisher {
  private readonly token: string;
  private readonly owner: string;

  constructor(token: string, owner: string) {
    this.token = token;
    this.owner = owner;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async ensureRepo(repoName: string): Promise<void> {
    const existing = await fetch(`https://api.github.com/repos/${this.owner}/${repoName}`, { headers: this.headers() });
    if (existing.ok) return;
    if (existing.status !== 404) throw new Error(`GitHub repo lookup failed (${existing.status})`);

    const created = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: repoName, private: false, auto_init: true, description: "Room2Store campaign storefront" }),
    });
    if (!created.ok) throw new Error(`GitHub repo creation failed (${created.status})`);
  }

  private async currentSha(repoName: string, path: string): Promise<string | undefined> {
    const response = await fetch(`https://api.github.com/repos/${this.owner}/${repoName}/contents/${path}`, { headers: this.headers() });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`GitHub contents lookup failed for ${path} (${response.status})`);
    return ((await response.json()) as GitHubContentsResponse).sha;
  }

  private async putFile(repoName: string, path: string, content: string): Promise<void> {
    const sha = await this.currentSha(repoName, path);
    const response = await fetch(`https://api.github.com/repos/${this.owner}/${repoName}/contents/${path}`, {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: sha ? `Update ${path}` : `Add ${path}`,
        content: Buffer.from(content, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    });
    if (!response.ok) throw new Error(`GitHub contents write failed for ${path} (${response.status})`);
  }

  async publish(campaignId: string, files: Record<string, string>): Promise<{ repoUrl: string }> {
    const repoName = repoNameFor(campaignId);
    await this.ensureRepo(repoName);
    for (const [path, content] of Object.entries(files)) await this.putFile(repoName, path, content);
    return { repoUrl: `https://github.com/${this.owner}/${repoName}` };
  }
}

/** Local, network-free stand-in — deterministic, so it's what tests and the no-token demo path run against. */
export class LocalRepoPublisher implements RepoPublisher {
  readonly publishedFiles = new Map<string, Record<string, string>>();

  async publish(campaignId: string, files: Record<string, string>): Promise<{ repoUrl: string }> {
    const repoName = repoNameFor(campaignId);
    this.publishedFiles.set(repoName, files);
    return { repoUrl: `https://github.com/local-demo/${repoName}` };
  }
}

/** Picks the live GitHub publisher when a token + owner are configured, else the local fallback. */
export function createRepoPublisher(token = process.env.GITHUB_TOKEN, owner = process.env.GITHUB_OWNER): RepoPublisher {
  if (token && owner) return new GitHubRepoPublisher(token, owner);
  return new LocalRepoPublisher();
}
