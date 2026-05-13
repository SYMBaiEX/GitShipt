/**
 * Step helpers for `revalidateBotFlags`. Pages through contributors with
 * automatic exclusion reasons and re-evaluates them against the current
 * `isAiBot()` patterns.
 */

import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { dbHttp } from "@/db";
import { contributors } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isAiVendorAccount } from "@repo/shared";

export interface CandidateRow {
  id: string;
  projectId: string;
  ghUsername: string;
  excluded: string;
  excludedReason: string | null;
}

export interface CandidatePageJson {
  rows: CandidateRow[];
  lastId: string | null;
}

const AUTOMATIC_REASONS = ["bot_detected", "treasury_routed_agent"];

export async function loadCandidateRowsStep(
  afterId: string | null,
  limit: number,
): Promise<CandidatePageJson> {
  "use step";
  const whereExpr = and(
    afterId ? gt(contributors.id, afterId) : undefined,
    or(
      isNull(contributors.excludedReason),
      inArray(contributors.excludedReason, AUTOMATIC_REASONS),
    ),
  );
  const rows = await dbHttp
    .select({
      id: contributors.id,
      projectId: contributors.projectId,
      ghUsername: contributors.ghUsername,
      excluded: contributors.excluded,
      excludedReason: contributors.excludedReason,
    })
    .from(contributors)
    .where(whereExpr)
    .orderBy(asc(contributors.id))
    .limit(limit);
  return {
    rows,
    lastId: rows.length > 0 ? rows[rows.length - 1]!.id : null,
  };
}

export async function reclassifyCandidatesStep(
  rows: CandidateRow[],
): Promise<{ flipped: number }> {
  "use step";
  let flipped = 0;
  const toExclude: string[] = [];
  const toUnExclude: string[] = [];
  // Scope: only revalidate the AI-vendor hard-deny. Generic CI bot
  // detection (BOT_REGEX) depends on per-project allowlists which we
  // don't load here; the indexer path handles re-evaluation for those.
  for (const row of rows) {
    const ai = isAiVendorAccount(row.ghUsername);
    if (ai && row.excluded !== "true") {
      toExclude.push(row.id);
    } else if (
      !ai &&
      row.excluded === "true" &&
      row.excludedReason === "bot_detected"
    ) {
      // Only flip back to false when the row was auto-excluded by the
      // detector and the vendor denylist no longer matches.
      toUnExclude.push(row.id);
    }
  }
  if (toExclude.length > 0) {
    await dbHttp
      .update(contributors)
      .set({ excluded: "true", excludedReason: "bot_detected" })
      .where(inArray(contributors.id, toExclude));
    flipped += toExclude.length;
  }
  if (toUnExclude.length > 0) {
    await dbHttp
      .update(contributors)
      .set({ excluded: "false", excludedReason: null })
      .where(inArray(contributors.id, toUnExclude));
    flipped += toUnExclude.length;
  }
  if (flipped > 0) {
    await audit({
      actorUserId: null,
      action: "contributor.bot_flag_revalidated",
      targetType: "contributor",
      targetId: rows[0]!.id,
      metadata: {
        flipped,
        excludedCount: toExclude.length,
        unExcludedCount: toUnExclude.length,
        sampleLogins: rows.slice(0, 5).map((r) => r.ghUsername),
      },
    });
  }
  return { flipped };
}
