import type { Permission } from "@/lib/auth/permissions";

export type AdminWorkflowName =
  | "healthPulse"
  | "indexGithubDeltas"
  | "takeSnapshot"
  | "rebalanceBps"
  | "publishKpis";

export function workflowRetriggerPermission(
  workflowName: AdminWorkflowName,
): Permission {
  if (workflowName === "rebalanceBps") return "payouts.trigger";
  if (workflowName === "takeSnapshot") return "snapshot.force";
  return "admin.workflows.inspect";
}
