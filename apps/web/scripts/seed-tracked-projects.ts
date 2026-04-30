/**
 * Seed fake launch/dogfood projects so they show up in /explore and are
 * reachable at /r/[org]/[repo]. These projects are owned by an existing
 * GitShipt user and run in simulated_live mode.
 *
 * Run from repo root:  bun --env-file=.env.local apps/web/scripts/seed-tracked-projects.ts
 */
import { databaseUrl, databaseUrlUnpooled } from "@/lib/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, sql } from "drizzle-orm";
import { users, projects } from "@/db/schema";
import type { ScoringConfig, PayoutConfig } from "@/db/schema/projects";

interface ProjectSeed {
  ghOwner: string;
  ghRepo: string;
  ghRepoId: string;
  ownerGithubUsername: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  tokenMint: string;
  bagsLaunchId: string;
}

const REMOVED_SEEDS = [{ ghOwner: "milady-ai", ghRepo: "milady" }];

const SEEDS: ProjectSeed[] = [
  {
    ghOwner: "SYMBaiEX",
    ghRepo: "gitshipt",
    ghRepoId: "fake-symbaiex-gitshipt",
    ownerGithubUsername: "SYMBaiEX",
    name: "GitShipt",
    symbol: "GSHIPT",
    description:
      "Fake dogfood launch for GitShipt. Daily trading fees redistribute to top contributors.",
    imageUrl: "https://github.com/SYMBaiEX.png",
    tokenMint: "GShiptFakeMint111111111111111111111111111111",
    bagsLaunchId: "bags_launch_fake_symbaiex_gitshipt_v0",
  },
];

const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  formulaVersion: "v1",
  windowDays: 30,
  weights: { mergedPRs: 3, commits: 1, reviews: 1.5, issues: 0.5, netLines: 0.2 },
  decay: "linear",
  botBlocklist: ["dependabot", "renovate-bot", "github-actions"],
  botAllowlist: [],
};
const DEFAULT_PAYOUT_CONFIG: PayoutConfig = {
  topN: 10,
  tierWeights: [0.3, 0.2, 0.15, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
  claimThresholdLamports: 100_000_000,
};

async function main(): Promise<void> {
  const url = databaseUrlUnpooled() ?? databaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL / DATABASE_URL_UNPOOLED missing");
  }
  const sqlClient = postgres(url, { max: 1 });
  const db = drizzle(sqlClient);

  try {
    for (const removed of REMOVED_SEEDS) {
      const deleted = await db
        .delete(projects)
        .where(
          and(
            eq(projects.ghOwner, removed.ghOwner),
            eq(projects.ghRepo, removed.ghRepo),
            eq(projects.status, "tracked"),
          ),
        )
        .returning({ id: projects.id });

      console.log(
        `[seed] removed ${deleted.length} tracked ${removed.ghOwner}/${removed.ghRepo} row(s)`,
      );
    }

    for (const seed of SEEDS) {
      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.githubUsername, seed.ownerGithubUsername))
        .limit(1);

      if (!owner) {
        throw new Error(
          `[seed] User with github_username='${seed.ownerGithubUsername}' not found`,
        );
      }

      const [existing] = await db
        .select({ id: projects.id, status: projects.status })
        .from(projects)
        .where(
          and(
            eq(projects.ghOwner, seed.ghOwner),
            eq(projects.ghRepo, seed.ghRepo),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(projects)
          .set({
            ownerUserId: owner.id,
            ghRepoId: seed.ghRepoId,
            name: seed.name,
            symbol: seed.symbol,
            description: seed.description,
            imageUrl: seed.imageUrl,
            tokenMint: seed.tokenMint,
            bagsLaunchId: seed.bagsLaunchId,
            status: "simulated_live",
            simulatedAt: sql`coalesce(${projects.simulatedAt}, now())`,
            scoringConfig: DEFAULT_SCORING_CONFIG,
            payoutConfig: DEFAULT_PAYOUT_CONFIG,
            updatedAt: sql`now()`,
          })
          .where(eq(projects.id, existing.id));
      } else {
        await db.insert(projects).values({
          ownerUserId: owner.id,
          ghOwner: seed.ghOwner,
          ghRepo: seed.ghRepo,
          ghRepoId: seed.ghRepoId,
          name: seed.name,
          symbol: seed.symbol,
          description: seed.description,
          imageUrl: seed.imageUrl,
          tokenMint: seed.tokenMint,
          bagsLaunchId: seed.bagsLaunchId,
          status: "simulated_live",
          simulatedAt: new Date(),
          scoringConfig: DEFAULT_SCORING_CONFIG,
          payoutConfig: DEFAULT_PAYOUT_CONFIG,
        });
      }

      console.log(
        `  ✓ ${seed.ghOwner}/${seed.ghRepo} owned by ${seed.ownerGithubUsername} (mint=${seed.tokenMint})`,
      );
    }
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
