import { randomUUID } from "node:crypto";
import type { Campaign, Item, Verdict, VerdictDecision } from "@room2store/contracts";
import { reviseRules, runItemRules, vetoRules } from "./rules.ts";

function decisionFor(rules: string[]): VerdictDecision {
  if (rules.some((rule) => vetoRules.has(rule))) return "veto";
  if (rules.some((rule) => reviseRules.has(rule))) return "revise";
  return "approve";
}

/**
 * B6: the whole compliance surface collapses into this one pure function —
 * run every rule against an item, decide, and produce the Verdict the rest
 * of the system reads. deployStore's gate (gate-engine.ts) only lets an
 * "approve" decision through; veto and revise both block it.
 */
export function evaluateItem(item: Item, campaign: Campaign): Verdict {
  const findings = runItemRules(item, campaign);
  const decision = decisionFor(findings.map((finding) => finding.rule));
  const reason = findings.length === 0
    ? "No prohibited category, unverifiable claim, excluded object, unsafe pickup detail, or exposed PII detected."
    : findings.map((finding) => finding.message).join(" ");

  return {
    id: `verdict_${randomUUID()}`,
    itemId: item.id,
    decision,
    rulesTriggered: findings.map((finding) => finding.rule),
    reason,
    createdAt: new Date().toISOString(),
  };
}
