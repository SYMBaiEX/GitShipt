"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Save, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Button } from "@repo/ui";
import { Badge } from "@repo/ui";
import type { ScoringConfig, PayoutConfig } from "@/db/schema";
import { updateScoringConfig, forceSnapshot } from "../../actions";

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Collapsible "Edit scoring" form rendered below the leaderboard.
 * Validation echoes the Zod schema in actions.ts: tier weights must sum to 1.
 */
export function ScoringConfigEditor({
  projectId,
  scoring,
  payout,
}: {
  projectId: string;
  scoring: ScoringConfig;
  payout: PayoutConfig;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [snapshotPending, startSnapshotTransition] = useTransition();
  const [windowDays, setWindowDays] = useState<number>(scoring.windowDays);
  const [tierWeights, setTierWeights] = useState<number[]>(payout.tierWeights);
  const [claimSol, setClaimSol] = useState<number>(
    payout.claimThresholdLamports / LAMPORTS_PER_SOL,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const sum = tierWeights.reduce((a, n) => a + n, 0);
  const sumValid = Math.abs(sum - 1) < 0.001;

  function handleWeightChange(index: number, raw: string) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      setTierWeights((prev) => prev.map((v, i) => (i === index ? n : v)));
    }
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    if (!sumValid) {
      setError(`tierWeights must sum to 1.0 (currently ${sum.toFixed(3)}).`);
      return;
    }
    startTransition(async () => {
      try {
        await updateScoringConfig({
          projectId,
          scoring: {
            ...scoring,
            windowDays,
          },
          payout: {
            ...payout,
            tierWeights,
            claimThresholdLamports: Math.round(claimSol * LAMPORTS_PER_SOL),
          },
          idempotencyKey: `scoring-ui-${projectId}-${Date.now()}`,
        });
        setSaved(true);
        toast.success("Scoring config updated");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Save failed";
        setError(message);
        toast.error(message);
      }
    });
  }

  function handleForceSnapshot() {
    setError(null);
    startSnapshotTransition(async () => {
      try {
        await forceSnapshot({
          projectId,
          idempotencyKey: `force-${projectId}-${Date.now()}`,
        });
        toast.success("Snapshot triggered");
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Snapshot trigger failed";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Card depth="flat" padding="none">
      <CardHeader className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Edit scoring</CardTitle>
            <CardDescription>
              Tune the window, tier weights, and claim threshold. Changes apply
              from the next snapshot.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? (
              <>
                Hide <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                Edit <ChevronDown className="size-4" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-5 px-6 py-5">
          <div>
            <label className="block text-label-sm text-fg-secondary">
              Scoring window (days)
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={7}
                max={90}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="gb-range-control flex-1"
              />
              <span className="w-12 text-right text-mono-md text-fg">
                {windowDays}d
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-label-sm text-fg-secondary">
                Tier weights (must sum to 1.0)
              </label>
              <Badge variant={sumValid ? "success" : "danger"} size="sm">
                Σ {sum.toFixed(3)}
              </Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {tierWeights.map((w, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-surface px-3 py-2"
                >
                  <div className="text-caption text-fg-muted">Rank {i + 1}</div>
                  <input
                    type="number"
                    step={0.01}
                    min={0}
                    max={1}
                    value={w}
                    onChange={(e) => handleWeightChange(i, e.target.value)}
                    className="mt-1 w-full bg-transparent text-mono-md text-fg outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-label-sm text-fg-secondary">
              Claim threshold (SOL)
            </label>
            <input
              type="number"
              step={0.001}
              min={0}
              value={claimSol}
              onChange={(e) => setClaimSol(Number(e.target.value))}
              className="mt-1 w-full max-w-xs rounded-md border border-border-strong bg-surface px-3 py-2 text-mono-md text-fg outline-none focus:border-primary"
            />
            <p className="mt-1 text-caption text-fg-muted">
              Below-threshold allocations stay in the current Bags fee-share
              configuration until the next rebalance.
            </p>
          </div>

          {error ? (
            <p className="text-body-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="text-body-sm text-success" role="status">
              Scoring config saved.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
              disabled={pending || !sumValid}
            >
              <Save className="size-4" />
              {pending ? "Saving..." : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleForceSnapshot}
              disabled={snapshotPending}
            >
              <Zap className="size-4" />
              {snapshotPending ? "Triggering..." : "Force snapshot now"}
            </Button>
            <span className="ml-auto text-caption text-fg-muted">
              Force snapshot is rate-limited to 1/hr/project.
            </span>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
