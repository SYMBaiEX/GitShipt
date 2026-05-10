"use client";

import { Activity, Coins, Sparkles, Users } from "lucide-react";
import { formatSol, formatUsd } from "@repo/lib";
import { hasRealLandingVolume, type LandingTicker } from "@/lib/queries/global";

/**
 * Horizontal KPI strip rendered just below the landing hero. Server passes
 * the canonical snapshot (`initial`). Volume is omitted unless the server
 * marks it as real Bags market data.
 */

type CellShape = {
  key: string;
  label: string;
  Icon: typeof Activity;
  value: string;
};

function deriveCells(initial: LandingTicker): CellShape[] {
  const lifetimeSol = Number(initial.lifetimeFeesLamports) / 1_000_000_000;
  const cells: CellShape[] = [
    {
      key: "fees",
      label: "Lifetime fees routed",
      Icon: Coins,
      value: formatSol(
        BigInt(Math.max(0, Math.round(lifetimeSol * 1_000_000_000))),
      ),
    },
    {
      key: "projects",
      label: "Active projects",
      Icon: Sparkles,
      value: Math.max(0, Math.round(initial.activeProjects)).toString(),
    },
    {
      key: "earning",
      label: "Contributors earning",
      Icon: Users,
      value: Math.max(0, Math.round(initial.contributorsEarning)).toString(),
    },
  ];
  return hasRealLandingVolume(initial)
    ? [
        {
          key: "volume",
          label: "24h volume",
          Icon: Activity,
          value: formatUsd(initial.volume24hUsd),
        },
        ...cells,
      ]
    : cells;
}

export function LiveTicker({ initial }: { initial: LandingTicker }) {
  const cells = deriveCells(initial);

  return (
    <section
      aria-label="Live platform metrics"
      className={
        cells.length === 4
          ? "grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface/40 p-3 sm:grid-cols-2 lg:grid-cols-4"
          : "grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface/40 p-3 sm:grid-cols-3"
      }
    >
      {cells.map(({ key, label, Icon, value }) => (
        <div
          key={key}
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface px-4 py-3"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-elevated text-fg-secondary"
          >
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-label-sm text-fg-muted">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-success" />
              {label}
            </span>
            <span className="truncate text-mono-md text-fg tabular-nums">
              {value}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
