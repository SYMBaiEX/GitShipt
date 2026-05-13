import { dbHttp } from "@/db";
import { contributors } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { ContributorAggregate } from "@/lib/github/indexer";
import { enterDbWorkflowContext } from "@/lib/db-rls";

/**
 * Step helper — upsert a batch of contributor aggregates for a project.
 * Conflict target is `(project_id, gh_user_id)`. Updates `inputs`,
 * username/avatar, `last_indexed_at`, AND re-evaluates `excluded` /
 * `excluded_reason` so that adding a new pattern to the bot regex
 * retroactively re-classifies existing rows on the next index pass.
 *
 * `manual_override`-style reasons are preserved: rows whose
 * `excluded_reason` does not start with `bot_detected` are not
 * automatically un-excluded by a fresh classification.
 */
export async function stepUpsertContributors(
  projectId: string,
  aggregates: ContributorAggregate[],
): Promise<{ count: number }> {
  "use step";
  enterDbWorkflowContext("contributors-upsert");
  if (aggregates.length === 0) return { count: 0 };

  const now = new Date();
  const rows = aggregates.map((a) => ({
    projectId,
    ghUserId: a.ghUserId,
    ghUsername: a.ghUsername,
    avatarUrl: a.avatarUrl,
    inputs: a.inputs,
    excluded: a.isBot ? "true" : "false",
    excludedReason: a.isBot ? "bot_detected" : null,
    lastIndexedAt: now,
  }));

  await dbHttp
    .insert(contributors)
    .values(rows)
    .onConflictDoUpdate({
      target: [contributors.projectId, contributors.ghUserId],
      set: {
        ghUsername: sql`excluded.gh_username`,
        avatarUrl: sql`excluded.avatar_url`,
        inputs: sql`excluded.inputs`,
        lastIndexedAt: sql`excluded.last_indexed_at`,
        // Re-evaluate exclusion only when the existing reason is
        // automatic (bot_detected, treasury_routed_agent) or null —
        // never override a manual operator decision.
        excluded: sql`
          CASE
            WHEN ${contributors.excludedReason} IS NULL
              OR ${contributors.excludedReason} = 'bot_detected'
              OR ${contributors.excludedReason} = 'treasury_routed_agent'
            THEN excluded.excluded
            ELSE ${contributors.excluded}
          END
        `,
        excludedReason: sql`
          CASE
            WHEN ${contributors.excludedReason} IS NULL
              OR ${contributors.excludedReason} = 'bot_detected'
              OR ${contributors.excludedReason} = 'treasury_routed_agent'
            THEN excluded.excluded_reason
            ELSE ${contributors.excludedReason}
          END
        `,
      },
    });

  return { count: aggregates.length };
}
