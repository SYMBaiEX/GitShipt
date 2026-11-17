"use client";

import { useEffect, useState } from "react";
import { cn } from "@repo/lib";
import { RelativeTime } from "./RelativeTime";

interface LiveIndicatorProps {
  /** When the upstream system last reported. Null = never. */
  lastSyncAt: Date | string | number | null | undefined;
  /** Seconds before the dot turns yellow (warning). Default 300 (5min). */
  warnAfterSec?: number;
  /** Seconds before the dot turns red (stale). Default 1800 (30min). */
  staleAfterSec?: number;
  /** Prefix label shown next to the dot. */
  label?: string;
  className?: string;
}

/**
 * Pulsing-dot freshness indicator. Three states based on age of `lastSyncAt`:
 *   - fresh (green, pulsing) — under `warnAfterSec`
 *   - warn  (yellow)         — past warn threshold, under stale threshold
 *   - stale (red)            — past stale threshold (system likely down)
 *
 * Re-evaluates every 30s so a viewer who leaves the tab open sees the dot
 * shift without reloading. The accompanying RelativeTime label updates on
 * the same cadence.
 */
export function LiveIndicator({
  lastSyncAt,
  warnAfterSec = 300,
  staleAfterSec = 1800,
  label = "Synced",
  className,
}: LiveIndicatorProps) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    const first = setTimeout(update, 0);
    const id = setInterval(update, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!lastSyncAt) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 text-mono-sm text-fg-muted",
          className,
        )}
      >
        <span
          className="size-2 rounded-full bg-fg-muted/40"
          aria-hidden="true"
        />
        Never synced
      </span>
    );
  }

  const dateObj =
    lastSyncAt instanceof Date ? lastSyncAt : new Date(lastSyncAt);
  // Defend against malformed inputs (invalid string, NaN). NaN would otherwise
  // make every threshold comparison false and the dot would fall through to
  // "stale" silently — the same visual as a real failure, masking the bug.
  if (!Number.isFinite(dateObj.getTime())) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 text-mono-sm text-fg-muted",
          className,
        )}
      >
        <span
          className="size-2 rounded-full bg-fg-muted/40"
          aria-hidden="true"
        />
        Invalid timestamp
      </span>
    );
  }
  const ageSec = Math.max(
    0,
    Math.floor(((nowMs ?? dateObj.getTime()) - dateObj.getTime()) / 1000),
  );

  let tone: "fresh" | "warn" | "stale";
  if (ageSec < warnAfterSec) tone = "fresh";
  else if (ageSec < staleAfterSec) tone = "warn";
  else tone = "stale";

  const dotClass =
    tone === "fresh"
      ? "bg-success animate-pulse-dot"
      : tone === "warn"
        ? "bg-warning"
        : "bg-danger";

  const textTone = tone === "stale" ? "text-danger" : "text-fg-muted";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-mono-sm",
        textTone,
        className,
      )}
      suppressHydrationWarning
    >
      <span
        className={cn("size-2 rounded-full", dotClass)}
        aria-hidden="true"
      />
      <span>{label}</span>
      <RelativeTime date={dateObj} />
    </span>
  );
}
