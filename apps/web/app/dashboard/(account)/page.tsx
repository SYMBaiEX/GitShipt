import { Suspense } from "react";
import Link from "next/link";
import { Coins, FolderGit2, Rocket, Wallet, Sparkles } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import {
  getMyProjects,
  getMyEarnings,
  getMyLinkedWallets,
} from "@/lib/queries/dashboard";
import { formatSol } from "@repo/lib";
import { OnboardingHero } from "../_components/OnboardingHero";
import { ProjectList } from "../_components/ProjectList";
import { StatTile } from "@/components/shared/StatTile";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Button } from "@repo/ui";

/**
 * Dashboard root — overview of all projects the user owns or admins.
 *
 * CVE-2025-29927 mitigation: re-validates the session inside the Server
 * Component even though `proxy.ts` already redirects unauthenticated traffic.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageContent />
    </Suspense>
  );
}

async function DashboardPageContent() {
  if (!hasCredentials.db()) return <DashboardStub />;

  const session = await requireAuthSession("/dashboard");

  const userId = session.user.id;
  const [projects, earnings, wallets] = await Promise.all([
    getMyProjects(userId),
    getMyEarnings(userId),
    getMyLinkedWallets(userId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <div className="flex justify-end">
        <Button asChild variant="primary" size="default">
          <Link href="/launch">
            <Rocket className="size-4" /> Launch a token
          </Link>
        </Button>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="My Projects"
          value={projects.length.toString()}
          icon={FolderGit2}
          sub={`${projects.filter((p) => p.status === "live").length} live`}
        />
        <StatTile
          label="Lifetime Fees Earned"
          value={formatSol(earnings.totalLifetimeLamports, 4)}
          icon={Coins}
          accent="primary"
        />
        <StatTile
          label="GitShipt Custody"
          value="0.0000 SOL"
          icon={Sparkles}
          sub="Claims stay in Bags"
        />
        <StatTile
          label="Wallets Linked"
          value={wallets.length.toString()}
          icon={Wallet}
          sub={wallets.find((w) => w.isPrimary) ? "Primary set" : "No primary"}
        />
      </section>

      <section>
        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>My Projects</CardTitle>
                <CardDescription>
                  Repositories you own or co-administer.
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/projects">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {projects.length === 0 ? (
              <OnboardingHero />
            ) : (
              <ProjectList rows={projects.slice(0, 8)} />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/**
 * Stub-mode page — DB unavailable, no real data. Shown when DATABASE_URL or POSTGRES_URL is
 * unset.
 */
function DashboardStub() {
  return (
    <div className="mx-auto w-full max-w-content">
      <EmptyState
        icon={Sparkles}
        title="Stub mode"
        description="Set DATABASE_URL or POSTGRES_URL to bring the dashboard online. Once Neon Postgres and GitHub OAuth are configured, your projects, earnings, and wallets will populate here."
        cta={{ label: "Sign in", href: "/auth/signin" }}
      />
    </div>
  );
}
