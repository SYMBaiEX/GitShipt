"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@repo/ui";
import {
  formatAddress,
  formatPercent,
  formatRelativeTime,
  formatScore,
  formatSol,
} from "@repo/lib";
import { cn } from "@repo/lib";
import { CopyButton } from "@/components/shared";
import type { SnapshotRow as SnapshotRowData } from "@/lib/queries/discovery";

/**
 * One row in the snapshot ledger. Top-level shows the freeze metadata; the
 * expand toggle reveals the top-10 leaderboard preview that was Merkle-rooted.
 */
export function SnapshotRow({
  row,
  informational = false,
}: {
  row: SnapshotRowData;
  informational?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const takenAtIso = row.takenAt.toISOString();

  return (
    <li className="transition-colors hover:bg-surface-elevated/40">
      <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_140px_170px_96px] items-center gap-3 px-5 py-3">
        <div className="min-w-0">
          <div className="text-body-md text-fg">
            {formatRelativeTime(row.takenAt)}
          </div>
          <div className="truncate text-caption text-fg-muted">
            <time dateTime={takenAtIso}>{formatUtcStamp(row.takenAt)}</time>
            <span className="ml-2 text-mono-sm text-fg-muted">
              {row.formulaVersion}
            </span>
          </div>
        </div>
        <div className="text-right">
          {!informational ? <StatusBadge status={row.status} /> : null}
          {!informational && row.forced ? (
            <div className="mt-1">
              <Badge variant="warning" size="sm">
                Forced
              </Badge>
            </div>
          ) : null}
        </div>
        <div className="text-right text-mono-md text-fg">
          {!informational ? row.recipientCount.toLocaleString("en-US") : null}
        </div>
        <div className="text-right text-mono-md text-fg">
          {!informational ? formatSol(row.totalFeesLamports, 4) : null}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span
            className="truncate text-mono-sm text-fg"
            title={row.merkleRoot}
          >
            {formatAddress(row.merkleRoot, 6, 6)}
          </span>
          <CopyButton value={row.merkleRoot} label="Copy Merkle root" />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="gb-control gb-control-ghost inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-label-sm text-fg-secondary hover:text-fg"
        >
          {open ? "Hide" : "View"}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {open ? (
        <div className="border-t border-border bg-surface/30 px-5 py-3">
          <div className="mb-2 text-caption text-fg-muted">
            Top {row.leaderboard.length} contributors captured in this snapshot
            {informational ? " (informational only)" : ""}
          </div>
          {row.leaderboard.length === 0 ? (
            <p className="text-body-sm text-fg-secondary">
              No leaderboard entries captured in this snapshot.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[34rem] w-full text-left">
                <thead>
                  <tr className="text-label-sm text-fg-muted">
                    <th className="pb-2 pr-4 font-medium">Rank</th>
                    <th className="pb-2 pr-4 font-medium">Contributor</th>
                    <th className="pb-2 pr-4 text-right font-medium">Score</th>
                    {!informational ? (
                      <th className="pb-2 text-right font-medium">Weight</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {row.leaderboard.map((e) => (
                    <tr key={`${e.rank}-${e.ghUsername}`}>
                      <td className="py-2 pr-4 text-mono-sm text-fg">
                        #{e.rank}
                      </td>
                      <td className="py-2 pr-4 text-body-sm text-fg">
                        <span className="text-mono-sm text-fg-secondary">
                          @
                        </span>
                        {e.ghUsername}
                      </td>
                      <td className="py-2 pr-4 text-right text-mono-md text-fg">
                        {formatScore(e.score)}
                      </td>
                      {!informational ? (
                        <td className="py-2 text-right text-mono-md text-fg">
                          {formatPercent(e.weight * 100, 1)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

function formatUtcStamp(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

function StatusBadge({ status }: { status: SnapshotRowData["status"] }) {
  if (status === "paid") {
    return (
      <Badge variant="success" size="sm" dot>
        Paid
      </Badge>
    );
  }
  if (status === "frozen") {
    return (
      <Badge variant="info" size="sm">
        Frozen
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="danger" size="sm">
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="warning" size="sm">
      Pending
    </Badge>
  );
}
