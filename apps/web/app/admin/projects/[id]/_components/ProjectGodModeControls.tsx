"use client";

import * as React from "react";
import {
  Pause,
  Power,
  RefreshCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@repo/ui";
import { DestructiveConfirmModal } from "@/components/admin/DestructiveConfirmModal";
import {
  pauseProject,
  killProject,
  forceSnapshot,
  recomputeLeaderboard,
  overrideScoringConfig,
} from "@/app/admin/actions";
import { ScoringConfigSchema } from "@repo/shared";

type Status =
  | "draft"
  | "launch_configured"
  | "live"
  | "paused"
  | "killed"
  | "simulated_live"
  | "tracked";

export function ProjectGodModeControls({
  projectId,
  projectName,
  status,
  scoringConfigJson,
  payoutConfigJson,
}: {
  projectId: string;
  projectName: string;
  status: Status;
  scoringConfigJson: string;
  payoutConfigJson: string;
}) {
  const [openModal, setOpenModal] = React.useState<
    null | "pause" | "kill"
  >(null);
  const [scoring, setScoring] = React.useState(scoringConfigJson);
  const [scoringErr, setScoringErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function handleForceSnapshot() {
    setBusy("snapshot");
    try {
      await forceSnapshot({
        projectId,
        idempotencyKey: `admin-snapshot-${projectId}-${Date.now()}`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleRecompute() {
    setBusy("recompute");
    try {
      await recomputeLeaderboard({
        projectId,
        idempotencyKey: `admin-recompute-${projectId}-${Date.now()}`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleOverrideScoring() {
    setScoringErr(null);
    let parsed: unknown;
    try {
      parsed = ScoringConfigSchema.parse(JSON.parse(scoring));
    } catch (e) {
      setScoringErr(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    setBusy("scoring");
    try {
      await overrideScoringConfig({
        projectId,
        scoringConfig: parsed,
        idempotencyKey: `admin-scoring-${projectId}-${Date.now()}`,
      });
    } catch (e) {
      setScoringErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpenModal("pause")}
          disabled={status === "paused" || status === "killed"}
        >
          <Pause className="size-4" /> Force pause
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setOpenModal("kill")}
          disabled={status === "killed"}
        >
          <Power className="size-4" /> Kill project
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleForceSnapshot}
          disabled={busy !== null}
        >
          <Sparkles className="size-4" /> Force snapshot
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRecompute}
          disabled={busy !== null}
        >
          <RefreshCcw className="size-4" /> Re-compute leaderboard
        </Button>
      </div>

      <details className="rounded-md border border-border/60 bg-surface-elevated/60 p-3">
        <summary className="gb-menu-item inline-flex cursor-pointer list-none rounded-md px-2 py-1 text-label-md text-fg">
          Override scoring config
        </summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={scoring}
            onChange={(e) => setScoring(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-mono-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            spellCheck={false}
          />
          {scoringErr ? (
            <p className="rounded-md border border-danger/40 bg-danger-soft px-3 py-1.5 text-body-sm text-danger">
              {scoringErr}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={handleOverrideScoring}
              disabled={busy !== null}
            >
              <Zap className="size-4" /> Apply override
            </Button>
          </div>
        </div>
      </details>

      <details className="rounded-md border border-border/60 bg-surface-elevated/60 p-3">
        <summary className="gb-menu-item inline-flex cursor-pointer list-none rounded-md px-2 py-1 text-label-md text-fg">
          Payout config (read-only here)
        </summary>
        <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-bg p-2 text-mono-sm text-fg-secondary">
          {payoutConfigJson}
        </pre>
      </details>

      <DestructiveConfirmModal
        open={openModal === "pause"}
        onOpenChange={(o) => setOpenModal(o ? "pause" : null)}
        title="Pause this project"
        description={
          <>
            New trades stop counting toward payouts. Existing snapshots stay
            paid. The project owner is notified.
          </>
        }
        targetName={projectName}
        confirmLabel="Pause project"
        action={async (p) => {
          return await pauseProject({ projectId, ...p });
        }}
        successToast={`${projectName} paused`}
      />
      <DestructiveConfirmModal
        open={openModal === "kill"}
        onOpenChange={(o) => setOpenModal(o ? "kill" : null)}
        title="Kill this project"
        description={
          <>
            Stops all future payouts permanently. Pending payouts are cancelled.
            Cannot be undone from this UI.
          </>
        }
        targetName={projectName}
        confirmLabel="Kill project"
        cosignRequired
        action={async (p) => {
          return await killProject({ projectId, ...p });
        }}
        successToast={`${projectName} killed — payouts halted`}
      />
    </div>
  );
}
