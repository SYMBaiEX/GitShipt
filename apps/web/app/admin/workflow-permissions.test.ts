import { describe, expect, it } from "vitest";
import { workflowRetriggerPermission } from "./workflow-permissions";

describe("workflowRetriggerPermission", () => {
  it("requires money-moving permissions for the BPS rebalance workflow", () => {
    expect(workflowRetriggerPermission("rebalanceBps")).toBe(
      "payouts.trigger",
    );
  });

  it("requires snapshot.force for takeSnapshot", () => {
    expect(workflowRetriggerPermission("takeSnapshot")).toBe("snapshot.force");
  });

  it("keeps non-money operational workflows inspect-gated", () => {
    expect(workflowRetriggerPermission("healthPulse")).toBe(
      "admin.workflows.inspect",
    );
    expect(workflowRetriggerPermission("indexGithubDeltas")).toBe(
      "admin.workflows.inspect",
    );
    expect(workflowRetriggerPermission("publishKpis")).toBe(
      "admin.workflows.inspect",
    );
  });
});
