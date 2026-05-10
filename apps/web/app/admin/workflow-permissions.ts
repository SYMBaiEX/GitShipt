import type { Permission } from "@/lib/auth/permissions";

export type AdminWorkflowName =
  | "healthPulse"
  | "indexGithubDeltas"
  | "takeSnapshot"
  | "rebalanceBps"
  | "claimPartnerFees"
  | "publishKpis";

export function workflowRetriggerPermission(
  workflowName: AdminWorkflowName,
): Permission {
  if (workflowName === "rebalanceBps") return "payouts.trigger";
  if (workflowName === "claimPartnerFees") return "platform.treasury.claim";
  if (workflowName === "takeSnapshot") return "snapshot.force";
  return "admin.workflows.inspect";
}
