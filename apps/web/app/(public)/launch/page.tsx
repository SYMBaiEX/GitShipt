import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { hasCredentials } from "@/lib/env";
import { getAuthSession } from "@/lib/auth/session";
import { getLaunchWizardConfig } from "@/lib/queries/launch";
import { dbHttp } from "@/db";
import { projects } from "@/db/schema";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { WizardShell, type DraftHydration } from "./_components/WizardShell";

export const metadata = {
  title: "Launch a token",
  description:
    "Pick a GitHub repo, configure metadata and the leaderboard, and launch a Bags.fm token.",
};

interface LaunchPageProps {
  searchParams: Promise<{ draftId?: string }>;
}

/**
 * /launch — entry point for the launch wizard.
 *
 * When `?draftId=...` is present, loads the draft project server-side (with
 * permission gate) and passes it to <WizardShell> for hydration. Otherwise
 * the wizard starts fresh at step 1.
 */
export default function LaunchPage({ searchParams }: LaunchPageProps) {
  return (
    <Suspense fallback={null}>
      <LaunchPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LaunchPageContent({ searchParams }: LaunchPageProps) {
  const params = await searchParams;
  const draftId = params.draftId?.trim() ?? null;

  const [session, config] = await Promise.all([
    getAuthSession(),
    getLaunchWizardConfig(),
  ]);
  const signedIn = Boolean(session?.user);
  const userId = session?.user?.id ?? null;

  let draft: DraftHydration | null = null;
  if (draftId && userId && hasCredentials.db()) {
    draft = await loadDraftForHydration(userId, draftId);
  }

  return (
    <WizardShell
      signedIn={signedIn}
      isStubMode={config.isStubMode}
      initialBuyLamports={config.initialBuyLamports}
      draft={draft}
    />
  );
}

/**
 * Load a draft project the user is allowed to edit and shape it into the
 * payload `<WizardShell>` uses to seed its store. Returns null on missing /
 * forbidden / non-draft so the wizard falls back to step 1.
 */
async function loadDraftForHydration(
  userId: string,
  projectId: string,
): Promise<DraftHydration | null> {
  const [project] = await dbHttp
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
  if (project.status !== "draft") return null;
  try {
    await requirePermission("project.update", { userId, projectId });
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }

  return {
    projectId: project.id,
    ghOwner: project.ghOwner,
    ghRepo: project.ghRepo,
    ghRepoId: project.ghRepoId,
    ghInstallationId: project.ghInstallationId,
    name: project.name,
    symbol: project.symbol,
    description: project.description,
    imageUrl: project.imageUrl,
    website: project.tokenWebsiteUrl,
    twitter: project.tokenTwitterUrl,
    telegram: project.tokenTelegramUrl,
    platformFeeBps: project.platformFeeBps,
    scoringConfig: project.scoringConfig,
    payoutConfig: project.payoutConfig,
  };
}
