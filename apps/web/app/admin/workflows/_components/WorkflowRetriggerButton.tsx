"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button } from "@repo/ui";
import { retriggerWorkflow } from "@/app/admin/actions";

type WorkflowName =
  | "healthPulse"
  | "indexGithubDeltas"
  | "computeLeaderboard"
  | "takeSnapshot"
  | "rebalanceBps"
  | "claimPartnerFees"
  | "publishKpis";

export function WorkflowRetriggerButton({
  name,
  disabled,
  disabledReason,
}: {
  name: WorkflowName;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<
    | { status: "idle" }
    | { status: "queued"; runId: string | null }
    | { status: "failed"; message: string }
  >({ status: "idle" });

  async function fire() {
    setBusy(true);
    setResult({ status: "idle" });
    try {
      const res = await retriggerWorkflow({
        name,
        idempotencyKey: `workflow-${name}-${Date.now()}`,
      });
      setResult({ status: "queued", runId: res.runId ?? null });
    } catch (e) {
      setResult({ status: "failed", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={disabled ? "ghost" : "secondary"}
        onClick={fire}
        disabled={disabled || busy}
        title={
          disabled
            ? disabledReason
            : "Queues a workflow run; check Vercel for completion."
        }
      >
        <Play className="size-3.5" />{" "}
        {busy
          ? "Queueing..."
          : result.status === "queued"
            ? "Queued"
            : "Queue run"}
      </Button>
      {result.status === "queued" ? (
        <span
          className="text-mono-sm text-success"
          title={result.runId ?? "Run queued"}
        >
          {result.runId ? `run ${result.runId.slice(0, 8)}` : "queued"}
        </span>
      ) : null}
      {result.status === "failed" ? (
        <span className="text-caption text-danger">{result.message}</span>
      ) : null}
    </div>
  );
}
