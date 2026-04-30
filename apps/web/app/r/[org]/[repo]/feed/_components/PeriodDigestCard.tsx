import Image from "next/image";
import Link from "next/link";
import { Newspaper, Pin } from "lucide-react";
import { Card } from "@repo/ui";
import { Badge } from "@repo/ui";
import { RankMedal } from "@/components/shared";
import { formatRelativeTime, formatScore } from "@repo/lib";
import type { PeriodDigestSubjects } from "@/db/schema";

interface PeriodDigestCardProps {
  subjects: PeriodDigestSubjects;
  createdAt: Date;
  pinned: boolean;
}

/**
 * Period-digest card — the synthesis of one snapshot's logbook + git history
 * into a scannable summary. Title shows the period date; pinned cards get a
 * subtle pin glyph in the header. Top contributors render with their rank
 * medal and the same input breakdown used on the leaderboard.
 *
 * Pure server component — receives `subjects` via the row, renders avatars
 * via GitHub's stable per-user redirect.
 */
export function PeriodDigestCard({
  subjects,
  createdAt,
  pinned,
}: PeriodDigestCardProps) {
  const t = subjects.totals;
  const activityChips: string[] = [];
  if (t.mergedPRs > 0)
    activityChips.push(
      `${t.mergedPRs} merged PR${t.mergedPRs === 1 ? "" : "s"}`,
    );
  if (t.commits > 0)
    activityChips.push(`${t.commits} commit${t.commits === 1 ? "" : "s"}`);
  if (t.reviews > 0)
    activityChips.push(`${t.reviews} review${t.reviews === 1 ? "" : "s"}`);
  if (t.issues > 0)
    activityChips.push(`${t.issues} issue${t.issues === 1 ? "" : "s"}`);

  return (
    <Card depth="raised" padding="none" className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-elevated/30 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Newspaper className="size-4 text-fg-muted" aria-hidden />
          <Badge variant="default" size="sm">
            Period digest
          </Badge>
          <span className="text-mono-sm text-fg">{subjects.period}</span>
          {pinned ? (
            <Pin className="size-3.5 text-fg-muted" aria-label="Pinned" />
          ) : null}
        </div>
        <time
          dateTime={createdAt.toISOString()}
          title={createdAt.toLocaleString()}
          className="text-caption text-fg-muted"
        >
          {formatRelativeTime(createdAt)}
        </time>
      </header>

      <div className="px-5 py-4">
        <div className="flex flex-col gap-1 text-body-md text-fg">
          <div>
            <span className="text-headline-sm">
              {t.contributors.toLocaleString("en-US")}
            </span>{" "}
            <span className="text-fg-secondary">
              contributor{t.contributors === 1 ? "" : "s"} active
            </span>
          </div>
          {activityChips.length > 0 ? (
            <div className="text-body-sm text-fg-secondary">
              {activityChips.join(" · ")}
            </div>
          ) : null}
          {t.netLines !== 0 ? (
            <div className="text-body-sm text-fg-secondary">
              <span className="text-mono-sm text-fg">
                {t.netLines >= 0 ? "+" : ""}
                {t.netLines.toLocaleString("en-US")}
              </span>{" "}
              lines net
            </div>
          ) : null}
        </div>

        {subjects.topContributors.length > 0 ? (
          <ul className="mt-4 divide-y divide-border/60">
            {subjects.topContributors.map((c) => (
              <li
                key={`${c.rank}-${c.ghUsername}`}
                className="grid grid-cols-[40px_minmax(0,1fr)_72px_minmax(0,140px)] items-center gap-3 py-2.5"
              >
                <div className="flex items-center">
                  <RankMedal rank={c.rank} />
                </div>
                <Link
                  href={`/u/${c.ghUsername}`}
                  className="flex min-w-0 items-center gap-2.5 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Image
                    src={`https://github.com/${c.ghUsername}.png?size=64`}
                    alt=""
                    width={28}
                    height={28}
                    className="size-7 shrink-0 rounded-md bg-surface-elevated"
                  />
                  <span className="truncate text-body-md text-fg">
                    @{c.ghUsername}
                  </span>
                </Link>
                <span className="text-right text-mono-md text-fg">
                  {formatScore(c.score)}
                </span>
                <span className="truncate text-right text-body-sm text-fg-muted">
                  {detailLine(c.inputs)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

function detailLine(
  inputs: PeriodDigestSubjects["topContributors"][number]["inputs"],
): string {
  const parts: string[] = [];
  if (inputs.mergedPRs > 0)
    parts.push(`${inputs.mergedPRs} PR${inputs.mergedPRs === 1 ? "" : "s"}`);
  if (inputs.commits > 0)
    parts.push(`${inputs.commits} commit${inputs.commits === 1 ? "" : "s"}`);
  if (inputs.reviews > 0)
    parts.push(`${inputs.reviews} review${inputs.reviews === 1 ? "" : "s"}`);
  if (inputs.issues > 0)
    parts.push(`${inputs.issues} issue${inputs.issues === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}
