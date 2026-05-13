/**
 * Step helpers for `revalidateBotFlags`. Pages through contributors with
 * automatic exclusion reasons and re-evaluates them against the current
 * `isAiVendorAccount()` denylist.
 */

import { and, asc, gt, inArray, isNull, or } from "drizzle-orm";
import { dbHttp } from "@/db";
import { contributors } from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  acquireWorkflowLock,
  releaseWorkflowLock,
  type WorkflowLock,
} from "@/lib/workflow-locks";
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

export async function acquireLockStep(): Promise<WorkflowLock> {
  "use step";
  return acquireWorkflowLock("revalidateBotFlags", "root", 20 * 60);
}

export async function releaseLockStep(lock: WorkflowLock): Promise<void> {
  "use step";
  if (!lock.acquired) return;
  await releaseWorkflowLock(lock);
}

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
  // Scope: only revalidate the AI-vendor hard-deny. Generic CI bot
  // detection (BOT_REGEX) depends on per-project allowlists which we
  // don't load here; the indexer path handles re-evaluation for those.
  const toExclude: CandidateRow[] = [];
  const toUnExclude: CandidateRow[] = [];
  for (const row of rows) {
    const ai = isAiVendorAccount(row.ghUsername);
    if (ai && row.excluded !== "true") {
      toExclude.push(row);
    } else if (
      !ai &&
      row.excluded === "true" &&
      row.excludedReason === "bot_detected"
    ) {
      toUnExclude.push(row);
    }
  }
  const excludeIds = toExclude.map((r) => r.id);
  const unExcludeIds = toUnExclude.map((r) => r.id);
  let flipped = 0;
  if (excludeIds.length > 0) {
    await dbHttp
      .update(contributors)
      .set({ excluded: "true", excludedReason: "bot_detected" })
      .where(inArray(contributors.id, excludeIds));
    flipped += excludeIds.length;
  }
  if (unExcludeIds.length > 0) {
    await dbHttp
      .update(contributors)
      .set({ excluded: "false", excludedReason: null })
      .where(inArray(contributors.id, unExcludeIds));
    flipped += unExcludeIds.length;
  }
  if (flipped > 0) {
    // One audit entry per affected project so the trail is queryable
    // by project rather than collapsing a multi-project batch into a
    // single (misleading) contributor row.
    const byProject = new Map<
      string,
      { excluded: CandidateRow[]; unExcluded: CandidateRow[] }
    >();
    for (const r of toExclude) {
      const slot = byProject.get(r.projectId) ?? {
        excluded: [],
        unExcluded: [],
      };
      slot.excluded.push(r);
      byProject.set(r.projectId, slot);
    }
    for (const r of toUnExclude) {
      const slot = byProject.get(r.projectId) ?? {
        excluded: [],
        unExcluded: [],
      };
      slot.unExcluded.push(r);
      byProject.set(r.projectId, slot);
    }
    for (const [projectId, group] of byProject) {
      await audit({
        actorUserId: null,
        action: "contributor.bot_flag_revalidated",
        targetType: "project",
        targetId: projectId,
        metadata: {
          excludedCount: group.excluded.length,
          unExcludedCount: group.unExcluded.length,
          excludedLogins: group.excluded.map((r) => r.ghUsername).slice(0, 10),
          unExcludedLogins: group.unExcluded
            .map((r) => r.ghUsername)
            .slice(0, 10),
        },
      });
    }
  }
  return { flipped };
}
