import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Coins,
  ExternalLink,
  Sparkles,
  Wallet,
} from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import { getMyEarnings, getMyLinkedWallets } from "@/lib/queries/dashboard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatTile } from "@/components/shared/StatTile";
import { formatSol } from "@repo/lib";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";

export default function EarningsPage() {
  return (
    <Suspense fallback={null}>
      <EarningsPageContent />
    </Suspense>
  );
}

async function EarningsPageContent() {
  if (!hasCredentials.db()) {
    return (
      <div className="mx-auto w-full max-w-content">
        <EmptyState
          icon={Sparkles}
          title="Stub mode"
          description="Set DATABASE_URL or POSTGRES_URL to review contributor earnings."
        />
      </div>
    );
  }

  const session = await requireAuthSession("/dashboard/earnings");
  const [earnings, wallets] = await Promise.all([
    getMyEarnings(session.user.id),
    getMyLinkedWallets(session.user.id),
  ]);
  const primaryWallet =
    wallets.find((wallet) => wallet.isPrimary) ?? wallets[0];

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-fg">Earnings</h1>
          <p className="mt-1 max-w-2xl text-body-sm text-fg-secondary">
            Contributor fee claims happen in Bags. GitShipt shows indexed
            contribution context and sends you to Bags for wallet-owned claims.
          </p>
        </div>
        <Button asChild variant="primary" size="default">
          <a href="https://bags.fm" target="_blank" rel="noreferrer">
            Open Bags <ExternalLink className="size-4" />
          </a>
        </Button>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Indexed lifetime"
          value={formatSol(earnings.totalLifetimeLamports, 4)}
          icon={Coins}
          accent="primary"
        />
        <StatTile
          label="GitShipt custody"
          value="0.0000 SOL"
          icon={Sparkles}
          sub="Contributor claims stay in Bags"
        />
        <StatTile
          label="Wallets linked"
          value={wallets.length.toString()}
          icon={Wallet}
          sub={primaryWallet ? shortAddress(primaryWallet.address) : "None"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Repos where GitShipt has indexed claim-relevant activity for your
              account.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {earnings.byProject.length === 0 ? (
              <EmptyState
                icon={Coins}
                title="No indexed earnings yet"
                description="Once a launched repo ranks you in a frozen snapshot, it will appear here. Bags remains the place where claimable fees are signed and received."
                bordered
                className="m-4"
              />
            ) : (
              <div className="divide-y divide-border">
                {earnings.byProject.map((project) => (
                  <Link
                    key={project.projectId || project.projectSlug}
                    href={`/r/${project.projectSlug}`}
                    className="grid gap-3 px-6 py-4 transition-colors hover:bg-surface-elevated/50 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-label-md text-fg">
                        {project.projectSlug}
                      </div>
                      <div className="mt-1 text-body-sm text-fg-secondary">
                        Bags-native contributor claim surface
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-mono-sm text-fg">
                      {formatSol(project.lifetimeLamports, 4)}
                      <ArrowUpRight className="size-4 text-fg-muted" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <CardTitle>Claim Path</CardTitle>
            <CardDescription>
              GitShipt never asks contributors to sign a custody withdrawal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-6 py-5">
            <ClaimStep
              label="1"
              title="Open Bags"
              detail="Use Bags with the same GitHub identity that earned repo activity."
            />
            <ClaimStep
              label="2"
              title="Connect wallet"
              detail="Your wallet signs the claim transaction directly in Bags."
            />
            <ClaimStep
              label="3"
              title="Track on GitShipt"
              detail="Snapshots and leaderboard state stay visible here for auditability."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClaimStep({
  label,
  title,
  detail,
}: {
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-mono-sm text-primary-readable">
        {label}
      </span>
      <div>
        <div className="text-label-md text-fg">{title}</div>
        <p className="mt-1 text-body-sm text-fg-secondary">{detail}</p>
      </div>
    </div>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
