"use client";

import { useId, useState } from "react";
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
  columns,
}: {
  row: SnapshotRowData;
  informational?: boolean;
  columns: string;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const takenAtIso = row.takenAt.toISOString();

  return (
    <li className="transition-colors hover:bg-surface-elevated/40">
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5",
          columns,
        )}
      >
        <div className="col-span-2 min-w-0 xl:col-span-1">
          <div className="text-body-md text-fg">
            {formatRelativeTime(row.takenAt)}
          </div>
          <div className="flex flex-wrap gap-x-2 text-mono-sm text-fg-muted">
            <time dateTime={takenAtIso}>{formatUtcStamp(row.takenAt)}</time>
            <span>{row.formulaVersion}</span>
          </div>
        </div>
        {!informational ? (
          <>
            <div className="col-span-2 min-w-0 xl:col-span-1 xl:text-right">
              <span className="sr-only">Status: </span>
              <StatusBadge status={row.status} />
              {row.forced ? (
                <span className="ml-1 inline-block xl:ml-0 xl:mt-1">
                  <Badge variant="warning" size="sm">
                    Forced
                  </Badge>
                </span>
              ) : null}
            </div>
            <div className="xl:text-right">
              <span className="block text-caption text-fg-muted xl:sr-only">
                Recipients
              </span>
              <span className="text-mono-md text-fg">
                {row.recipientCount.toLocaleString("en-US")}
              </span>
            </div>
            <div className="xl:text-right">
              <span className="block text-caption text-fg-muted xl:sr-only">
                Fees
              </span>
              <span className="text-mono-md text-fg">
                {formatSol(row.totalFeesLamports, 4)}
              </span>
            </div>
          </>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 xl:justify-end">
          <span className="w-full text-caption text-fg-muted xl:sr-only">
            Merkle root
          </span>
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
          aria-controls={detailsId}
          className="gb-control gb-control-ghost inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-2 text-label-sm text-fg-secondary hover:text-fg"
        >
          {open ? "Hide" : "View"}
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      <div id={detailsId} hidden={!open}>
        {open ? (
          <div className="border-t border-border bg-surface/30 px-4 py-3 sm:px-5">
            <div className="mb-2 text-caption text-fg-muted">
              Top {row.leaderboard.length} contributors captured in this
              snapshot
              {informational ? " (informational only)" : ""}
            </div>
            {row.leaderboard.length === 0 ? (
              <p className="text-body-sm text-fg-secondary">
                No leaderboard entries captured in this snapshot.
              </p>
            ) : (
              <div
                className="overflow-x-auto focus-visible:outline-offset-[-2px]"
                role="region"
                aria-label="Snapshot contributor results"
                tabIndex={0}
              >
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-label-sm text-fg-muted">
                      <th className="pb-2 pr-4 font-medium">Rank</th>
                      <th className="pb-2 pr-4 font-medium">Contributor</th>
                      <th className="pb-2 pr-4 text-right font-medium">
                        Score
                      </th>
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
      </div>
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
