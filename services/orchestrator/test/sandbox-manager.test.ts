import assert from "node:assert/strict";
import test from "node:test";
import { LocalSandboxManager } from "../src/sandbox-manager.ts";

test("provisions a sandbox once per campaign, idempotently", async () => {
  const manager = new LocalSandboxManager();

  const first = await manager.provision("cmp_sandbox_001");
  assert.equal(first.action, "provisioned");
  assert.match(first.reason, /created/);

  const second = await manager.provision("cmp_sandbox_001");
  assert.equal(second.sandboxId, first.sandboxId);
  assert.match(second.reason, /already provisioned/);
});

test("pauses and resumes a campaign's sandbox, noting when the state didn't actually change", async () => {
  const manager = new LocalSandboxManager();
  await manager.provision("cmp_sandbox_002");

  const paused = await manager.pause("cmp_sandbox_002", "store deployed at https://demo.example/cmp_sandbox_002");
  assert.equal(paused.action, "paused");
  assert.doesNotMatch(paused.reason, /already paused/);

  const pausedAgain = await manager.pause("cmp_sandbox_002", "store deployed again");
  assert.match(pausedAgain.reason, /already paused/);

  const resumed = await manager.resume("cmp_sandbox_002", "buyer texted about item_1");
  assert.equal(resumed.action, "resumed");
  assert.doesNotMatch(resumed.reason, /already active/);

  const resumedAgain = await manager.resume("cmp_sandbox_002", "buyer texted again");
  assert.match(resumedAgain.reason, /already active/);
});

test("execute provisions on first use and always leaves the sandbox active", async () => {
  const manager = new LocalSandboxManager();

  const result = await manager.execute("cmp_sandbox_003", "echo hello");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /echo hello/);

  await manager.pause("cmp_sandbox_003", "store deployed");
  await manager.execute("cmp_sandbox_003", "echo again");
  const resumed = await manager.resume("cmp_sandbox_003", "buyer texted");
  assert.match(resumed.reason, /already active/); // execute() already woke it up
});

test("pause/resume reject a campaign with no provisioned sandbox", async () => {
  const manager = new LocalSandboxManager();
  await assert.rejects(manager.pause("cmp_sandbox_missing", "x"), /No Superserve sandbox provisioned/);
  await assert.rejects(manager.resume("cmp_sandbox_missing", "x"), /No Superserve sandbox provisioned/);
});
