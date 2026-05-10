"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@repo/lib";
import { Button } from "@repo/ui";
import { FormField } from "@/components/shared/FormField";
import {
  defaultTierWeights,
  LAMPORTS_PER_SOL_NUMBER,
  type SteadyStateCadenceHours,
} from "@repo/shared";
import type { LeaderboardConfig } from "@/lib/state/launch-wizard-store";
import { CadenceSelector } from "./CadenceSelector";

const TOP_N_MIN = 3; // server-side Zod minimum (PayoutConfigSchema.topN)
const TOP_N_MAX = 50;
const WINDOW_MIN = 7;
const WINDOW_MAX = 90;
const PLATFORM_FEE_BPS_MIN = 0;
const PLATFORM_FEE_BPS_PROTOCOL_MAX = 10_000;

export interface LeaderboardConfigFormProps {
  initial: LeaderboardConfig;
  onBack: () => void;
  onSubmit: (data: LeaderboardConfig) => void;
}

export function LeaderboardConfigForm({
  initial,
  onBack,
  onSubmit,
}: LeaderboardConfigFormProps) {
  const [windowDays, setWindowDays] = useState(initial.windowDays);
  const [topN, setTopN] = useState(initial.topN);
  const [tierWeights, setTierWeights] = useState<number[]>(initial.tierWeights);
  const [thresholdSol, setThresholdSol] = useState(
    initial.claimThresholdLamports / LAMPORTS_PER_SOL_NUMBER,
  );
  const [platformFeeBps, setPlatformFeeBps] = useState(initial.platformFeeBps);
  const [steadyStateCadenceHours, setSteadyStateCadenceHours] =
    useState<SteadyStateCadenceHours>(initial.steadyStateCadenceHours);
  const [maxClaimers, setMaxClaimers] = useState(initial.maxClaimers);

  const tierSum = useMemo(
    () => tierWeights.reduce((a, b) => a + b, 0),
    [tierWeights],
  );

  const tierSumOk = tierSum > 0 && tierSum <= 1.0001;

  const platformFeePercent = (platformFeeBps / 100).toFixed(2);
  const contributorPoolBps = Math.max(0, 10_000 - platformFeeBps);
  const contributorPoolPercent = (contributorPoolBps / 100).toFixed(2);
  const claimThresholdLamports = Math.max(
    0,
    Math.round(thresholdSol * LAMPORTS_PER_SOL_NUMBER),
  );

  const windowError =
    windowDays < WINDOW_MIN || windowDays > WINDOW_MAX
      ? `Choose ${WINDOW_MIN}-${WINDOW_MAX} days`
      : undefined;
  const topNError =
    topN < TOP_N_MIN || topN > TOP_N_MAX
      ? `Choose ${TOP_N_MIN}-${TOP_N_MAX} contributors`
      : undefined;
  const tierError = !tierSumOk
    ? `Payout split must be 100% or less (currently ${(tierSum * 100).toFixed(1)}%)`
    : undefined;
  const thresholdError =
    !Number.isFinite(thresholdSol) || thresholdSol < 0
      ? "Threshold must be 0 or greater"
      : undefined;
  const feeError =
    platformFeeBps < PLATFORM_FEE_BPS_MIN
      ? "Legacy platform fee cannot be negative"
      : platformFeeBps > PLATFORM_FEE_BPS_PROTOCOL_MAX
        ? "Legacy platform fee cannot exceed 100% of trading fees"
        : undefined;

  const isValid =
    !windowError &&
    !topNError &&
    !tierError &&
    !thresholdError &&
    !feeError &&
    tierWeights.length === topN;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      windowDays,
      topN,
      tierWeights,
      claimThresholdLamports,
      platformFeeBps,
      steadyStateCadenceHours,
      maxClaimers,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-headline-sm">Leaderboard</h2>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <section className="space-y-3">
            <FormField
              label={`Scoring window: ${windowDays} days`}
              hint="Recent activity window."
              error={windowError}
            >
              <input
                type="range"
                min={WINDOW_MIN}
                max={WINDOW_MAX}
                step={1}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="gb-range-control w-full"
              />
            </FormField>
            <div className="flex items-center justify-between text-caption text-fg-muted">
              <span>{WINDOW_MIN}d</span>
              <span className="text-mono-sm text-fg-secondary">
                {windowDays}d
              </span>
              <span>{WINDOW_MAX}d</span>
            </div>
          </section>

          <section className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <FormField
              label={`Paid contributors: ${topN}`}
              hint="Top ranked contributors."
              error={topNError}
            >
              <input
                type="number"
                min={TOP_N_MIN}
                max={TOP_N_MAX}
                step={1}
                value={topN}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    const nextTopN = Math.max(
                      TOP_N_MIN,
                      Math.min(TOP_N_MAX, Math.round(v)),
                    );
                    setTopN(nextTopN);
                    setTierWeights(defaultTierWeights(nextTopN));
                  }
                }}
                className={inputClass}
              />
            </FormField>

            <FormField
              label={`Min payout: ${thresholdSol.toFixed(4)} SOL`}
              hint="Skip tiny daily payouts."
              error={thresholdError}
            >
              <input
                type="number"
                min={0}
                step="0.001"
                value={thresholdSol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0) {
                    setThresholdSol(v);
                  }
                }}
                className={cn(inputClass, "text-mono-md")}
              />
            </FormField>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-label-md text-fg">Rank split</div>
              <div className="text-mono-sm text-fg-secondary">
                {(tierSum * 100).toFixed(1)}%
              </div>
            </div>
            <PayoutSplitPreview tierWeights={tierWeights} />
            {tierError ? (
              <p className="text-caption text-danger">{tierError}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTierWeights(defaultTierWeights(topN))}
              >
                Reset split
              </Button>
              <details className="group rounded-md border border-border/70 bg-surface/50">
                <summary className="gb-control gb-control-secondary flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-label-md text-fg">
                  Edit ranks
                  <span className="text-mono-sm text-fg-muted">{topN}</span>
                </summary>
                <div className="border-t border-border/70 p-3">
                  <TierWeightEditor
                    tierWeights={tierWeights}
                    onChange={setTierWeights}
                  />
                </div>
              </details>
            </div>
          </section>
        </div>

        <aside className="space-y-3 rounded-lg border border-border bg-surface-elevated/40 p-3 lg:sticky lg:top-4">
          <FormField
            label={`Legacy treasury rail: ${platformFeePercent}%`}
            hint="Production revenue uses the Bags partner rail."
            error={feeError}
          >
            <input
              type="number"
              min={0}
              step={0.25}
              value={platformFeeBps / 100}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) {
                  setPlatformFeeBps(Math.round(v * 100));
                }
              }}
              className={cn(inputClass, "text-mono-md")}
            />
          </FormField>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-fg-muted">
                Contributor pool
              </span>
              <span className="text-mono-sm text-fg">
                {contributorPoolPercent}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-fg-muted">GitShipt fee</span>
              <span className="text-mono-sm text-fg">25.00%</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-fg-muted">Partner rail</span>
              <span className="text-label-sm text-fg">Bags config</span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-body-sm text-fg-muted">Agents/bots</span>
              <span className="text-label-sm text-fg">Treasury</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="space-y-3 border-t border-border pt-5">
        <CadenceSelector
          value={steadyStateCadenceHours}
          onChange={setSteadyStateCadenceHours}
        />
        <FormField
          label={`Maximum contributor slots: ${maxClaimers}`}
          hint="At launch we resolve up to this many top contributors. Bags caps the on-chain slot list at 100."
        >
          <input
            type="number"
            min={1}
            max={100}
            value={maxClaimers}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) {
                setMaxClaimers(Math.max(1, Math.min(100, Math.round(v))));
              }
            }}
            className={cn(inputClass, "text-mono-md")}
          />
        </FormField>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button type="submit" disabled={!isValid}>
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  );
}

function TierWeightEditor({
  tierWeights,
  onChange,
}: {
  tierWeights: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <ul className="grid max-h-[220px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
      {tierWeights.map((w, idx) => {
        const rank = idx + 1;
        return (
          <li
            key={rank}
            className="flex items-center gap-2 rounded-md bg-surface px-2 py-1"
          >
            <span className="w-10 text-label-sm text-fg-muted">#{rank}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={Number((w * 100).toFixed(2))}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                const next = [...tierWeights];
                next[idx] = Math.max(0, Math.min(100, v)) / 100;
                onChange(next);
              }}
              className={cn(
                "h-8 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2",
                "text-mono-sm outline-none focus:border-primary",
              )}
              aria-label={`Rank ${rank} payout percentage`}
            />
            <span className="text-mono-sm text-fg-muted">%</span>
          </li>
        );
      })}
    </ul>
  );
}

function PayoutSplitPreview({ tierWeights }: { tierWeights: number[] }) {
  const topWeights = tierWeights.slice(0, 3);
  const remainingWeight = tierWeights.slice(3).reduce((a, b) => a + b, 0);
  const blocks = topWeights.map((weight, idx) => ({
    label: `#${idx + 1}`,
    value: weight,
  }));
  if (tierWeights.length > 3) {
    blocks.push({ label: `#4-${tierWeights.length}`, value: remainingWeight });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {blocks.map((block) => (
        <div
          key={block.label}
          className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-surface/50 px-3 py-2 sm:block"
        >
          <div className="text-label-sm text-fg-muted">{block.label}</div>
          <div className="text-mono-md text-fg sm:mt-1">
            {(block.value * 100).toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

const inputClass = cn(
  "h-10 w-full rounded-md border border-border-strong bg-surface px-3",
  "text-body-md text-fg outline-none placeholder:text-fg-muted",
  "focus:border-primary",
);
