"use client";

import { useEffect, useState } from "react";
import { cn, formatRelativeTime } from "@repo/lib";

interface RelativeTimeProps {
  date: Date | string | number;
  /** Re-render interval in seconds. Default 30s — sub-minute granularity is
   *  enough for "synced 4m ago" labels. */
  intervalSec?: number;
  className?: string;
}

/**
 * Auto-updating relative-time label. Server renders the string at request
 * time; the client island re-renders every `intervalSec` seconds so the
 * "2m ago" / "1h ago" label stays accurate without the user reloading.
 *
 * Mismatch between SSR and first client render is intentional (clocks differ
 * by a few seconds) — `suppressHydrationWarning` avoids the React warning.
 */
export function RelativeTime({
  date,
  intervalSec = 30,
  className,
}: RelativeTimeProps) {
  // Floor at 1s. setInterval(fn, 0) busy-loops; floats < 1 round to 0 in some
  // engines. Caller intent for sub-second is almost certainly a bug.
  const interval = Number.isFinite(intervalSec) ? intervalSec : 30;
  const safeIntervalMs = Math.max(1000, Math.floor(interval) * 1000);
  // We don't read the tick — it just forces a re-render so formatRelativeTime
  // computes against a fresh Date.now().
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), safeIntervalMs);
    return () => clearInterval(id);
  }, [safeIntervalMs]);

  const dateObj = date instanceof Date ? date : new Date(date);
  const valid = Number.isFinite(dateObj.getTime());
  const iso = valid ? dateObj.toISOString() : "";

  return (
    <time
      dateTime={iso}
      title={valid ? dateObj.toLocaleString() : "unknown"}
      className={cn(className)}
      suppressHydrationWarning
    >
      {formatRelativeTime(dateObj)}
    </time>
  );
}
