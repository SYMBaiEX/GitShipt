import {
  snapshotAcquireLockStep,
  snapshotReleaseLockStep,
  snapshotAssertNotKilled,
  snapshotHeartbeatStep,
  loadEligibleProjectIdsStep,
  loadProjectStep,
  loadContributorsStep,
  freezeStep,
  snapshotRevalidateProjectCachesStep,
  snapshotWriteFeedDigestStep,
  startTakeProjectSnapshotStep,
  buildLeaderboardEntries,
} from "@/workflows/steps/snapshot-helpers";

/**
 * takeSnapshot — daily root, 00:00 UTC.
 *
 * Reads kill switch, writes a heartbeat, and fans out a child workflow per
 * eligible (live + has ranked contributors) project.
 */
export async function takeSnapshot(): Promise<{ count: number }> {
  "use workflow";
  const lock = await snapshotAcquireLockStep("takeSnapshot", "root", 20 * 60);
  if (!lock.acquired) return { count: 0 };
  try {
    await snapshotAssertNotKilled();
    await snapshotHeartbeatStep("snapshot");
    const projectIds = await loadEligibleProjectIdsStep();
    for (const id of projectIds) {
      await startTakeProjectSnapshotStep(id);
    }
    return { count: projectIds.length };
  } finally {
    await snapshotReleaseLockStep(lock);
  }
}

/**
 * Per-project snapshot freeze. Idempotent by (projectId, UTC day): the
 * snapshot table owns the period uniqueness, and freezeSnapshot returns the
 * existing active period row when a cron/manual retry races.
 */
export async function takeProjectSnapshot(projectId: string): Promise<{
  snapshotId: string;
  count: number;
}> {
  "use workflow";
  const lock = await snapshotAcquireLockStep(
    "takeProjectSnapshot",
    projectId,
    20 * 60,
  );
  if (!lock.acquired) return { snapshotId: "", count: 0 };
  try {
    const project = await loadProjectStep(projectId);
    if (!project) return { snapshotId: "", count: 0 };

    const contributors = await loadContributorsStep(
      projectId,
      project.payoutConfig.topN,
    );
    if (contributors.length === 0) return { snapshotId: "", count: 0 };

    const leaderboard = buildLeaderboardEntries(
      contributors,
      project.payoutConfig.tierWeights,
    );

    const result = await freezeStep({
      projectId,
      formulaVersion: project.scoringConfig.formulaVersion,
      leaderboard,
    });

    // Bags-native architecture: BPS rebalance happens on its own cadence in
    // workflows/rebalanceBps.ts driven by payout_schedules.next_run_at, NOT
    // here. The takeSnapshot workflow's job ends at freezing the leaderboard.

    // Write the period_digest feed card before revalidating caches so the
    // first reader after this snapshot sees the new card. Failures inside
    // the step are captured and swallowed — feed must not gate finalize.
    await snapshotWriteFeedDigestStep(result.snapshotId);

    await snapshotRevalidateProjectCachesStep(projectId);

    return { snapshotId: result.snapshotId, count: result.leaderboardCount };
  } finally {
    await snapshotReleaseLockStep(lock);
  }
}
