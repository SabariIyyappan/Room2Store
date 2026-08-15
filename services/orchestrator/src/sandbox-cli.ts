import { createSandboxManager } from "./sandbox-manager.ts";

/**
 * B8 demo helper — exercises a campaign's Superserve sandbox through its
 * full bursty lifecycle without needing the rest of the pipeline wired up:
 * provision, run a command, pause (as if the store just deployed), resume
 * (as if a buyer just texted). Useful for showing judges the pause/resume
 * behavior on its own.
 */
const campaignId = process.argv[2];
const action = process.argv[3] ?? "demo";
if (!campaignId) throw new Error("Usage: pnpm sandbox:demo -- <campaign-id> [provision|pause|resume|demo]");

const manager = createSandboxManager();

async function report(label: string, event: Promise<{ sandboxId: string; action: string; reason: string }>): Promise<void> {
  const result = await event;
  console.log(`${label}: sandbox ${result.sandboxId} ${result.action} — ${result.reason}`);
}

switch (action) {
  case "provision":
    await report("provision", manager.provision(campaignId));
    break;
  case "pause":
    await report("pause", manager.pause(campaignId, "manual demo pause"));
    break;
  case "resume":
    await report("resume", manager.resume(campaignId, "manual demo resume"));
    break;
  case "demo":
  default: {
    await report("provision", manager.provision(campaignId));
    const exec = await manager.execute(campaignId, "echo Room2Store sandbox is alive");
    console.log(`execute: exit ${exec.exitCode} — ${exec.stdout.trim()}`);
    await report("pause", manager.pause(campaignId, "store deployed (demo)"));
    await report("resume", manager.resume(campaignId, "buyer texted (demo)"));
    break;
  }
}
