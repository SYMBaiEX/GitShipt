/**
 * Periodic bot-flag re-evaluation.
 *
 * The `stepUpsertContributors` path re-evaluates `excluded` only when a
 * contributor appears in a fresh indexer batch. A contributor who stops
 * committing keeps their last `excluded` value forever. This cron pages
 * through all contributor rows (whose reason is `bot_detected` or null)
 * and re-runs `isAiBot()` so that adding a new pattern retroactively
 * re-classifies historical rows.
 *
 * Idempotent: re-running the cron is a no-op except for newly matching
 * rows. Manual `excluded_reason` values (anything other than null,
 * `bot_detected`, or `treasury_routed_agent`) are preserved.
 */

import {
  acquireLockStep,
  loadCandidateRowsStep,
  reclassifyCandidatesStep,
  releaseLockStep,
} from "@/workflows/steps/revalidateBotFlags-helpers";

export async function revalidateBotFlags(): Promise<{
  scanned: number;
  flipped: number;
  status: "completed" | "skipped_locked";
}> {
  "use workflow";
  // Single-flight: if another instance is mid-revalidation, skip.
  const lock = await acquireLockStep();
  if (!lock.acquired) {
    return { scanned: 0, flipped: 0, status: "skipped_locked" };
  }
  try {
    let scanned = 0;
    let flipped = 0;
    let lastId: string | null = null;
    const pageSize = 500;
    // Cap the per-run work so a single cron tick is bounded.
    const maxPages = 50;
    for (let i = 0; i < maxPages; i++) {
      const page = await loadCandidateRowsStep(lastId, pageSize);
      if (page.rows.length === 0) break;
      const result = await reclassifyCandidatesStep(page.rows);
      scanned += page.rows.length;
      flipped += result.flipped;
      lastId = page.lastId;
      if (page.rows.length < pageSize) break;
    }
    return { scanned, flipped, status: "completed" };
  } finally {
    await releaseLockStep(lock);
  }
}
