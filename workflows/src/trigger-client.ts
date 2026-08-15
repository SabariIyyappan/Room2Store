import { createWorkflowsClient, type WorkflowsClient } from "@renderinc/sdk/workflows";

/**
 * B9: triggers a deployed Render Workflow task run remotely — what C's
 * commerce layer calls once a real buyer texts (`sell`) or pays
 * (`settle`), and what a dashboard "run pipeline" button calls for
 * `runCampaignPipeline`. Task slugs are `"<workflow-service-slug>/<task
 * name>"` (docs.render.com/docs/workflows-sdk-typescript); the service slug
 * comes from whatever name the workflow service is given when it's linked
 * on Render (B12), so it's read from env rather than hardcoded here.
 */
export function createRenderWorkflowsClient(token = process.env.RENDER_API_KEY): WorkflowsClient {
  if (!token) throw new Error("RENDER_API_KEY is required to trigger a Render Workflow task run");
  return createWorkflowsClient({ token });
}

export function taskSlug(taskName: string, serviceSlug = process.env.RENDER_WORKFLOW_SERVICE_SLUG ?? "room2store-workflows"): string {
  return `${serviceSlug}/${taskName}`;
}
