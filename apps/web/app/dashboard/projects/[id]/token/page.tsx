import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { bags } from "@/lib/bags/client";
import { getProjectPayoutHistory } from "@/lib/queries/dashboard";
import {
  formatAddress,
  formatPercent,
  formatRelativeTime,
  formatSol,
} from "@repo/lib";
import { loadProjectFor } from "../../../_components/loadProject";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { CopyButton } from "@/components/shared";
import { EmptyState } from "@/components/shared/EmptyState";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { StartIncorporationButton } from "./_components/StartIncorporationButton";
import { IncorporationStatusCard } from "@/components/bags/IncorporationStatusCard";
import { DexscreenerUpsellCard } from "@/components/bags/DexscreenerUpsellCard";
import { getActiveDexscreenerOrderForProject } from "@/lib/queries/dexscreener-orders";
import { solscanTokenUrl, solscanTxUrl } from "@/lib/solana/explorer";


export default function TokenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <TokenPageContent params={params} />
    </Suspense>
  );
}

async function TokenPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) return <Stub />;
  const { id } = await params;
  const ctx = await loadProjectFor(id, "project.read");
  const { project } = ctx;
  const payouts = await getProjectPayoutHistory(id, 20);
  const completed = payouts.filter((p) => p.status === "completed");
  const contributorBps = 10_000 - project.platformFeeBps;
  const incorporation =
    project.tokenMint && hasCredentials.bags()
      ? await bags.getIncorporationDetails(project.tokenMint).catch(() => null)
      : null;
  const dexscreenerOrder = await getActiveDexscreenerOrderForProject(id);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${id}` },
          { label: "Token" },
        ]}
      />

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>Token info</CardTitle>
          <CardDescription>Mint address and fee share split.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-6 py-5">
          {project.tokenMint ? (
            <>
              <Row label="Mint">
                <span className="inline-flex items-center gap-2">
                  <span className="text-mono-md text-fg">
                    {formatAddress(project.tokenMint, 6, 6)}
                  </span>
                  <CopyButton value={project.tokenMint} label="Copy mint" />
                  <Link
                    href={solscanTokenUrl(project.tokenMint)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-fg-muted hover:text-fg"
                    aria-label="Solscan"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                </span>
              </Row>
              <Row label="Bags launch ID">
                <span className="text-mono-md text-fg">
                  {project.bagsLaunchId ?? "—"}
                </span>
              </Row>
              <Row label="Launch state">
                <Badge
                  variant={
                    project.status === "live"
                      ? "success"
                      : project.status === "launch_configured"
                        ? "warning"
                        : "default"
                  }
                  size="sm"
                  dot={project.status === "live"}
                >
                  {project.status === "launch_configured"
                    ? "Configured"
                    : project.status}
                </Badge>
              </Row>
              <Row label="Contributor fee share">
                <span className="inline-flex items-center gap-2 text-mono-md text-primary-readable">
                  {formatPercent(contributorBps / 100, 1)}
                  <Badge variant="default" size="sm">
                    platform {formatPercent(project.platformFeeBps / 100, 1)}
                  </Badge>
                </span>
              </Row>
              <div className="border-t border-border pt-3">
                <Button asChild variant="secondary">
                  <Link
                    href={bags.bagsTokenUrl(project.tokenMint)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    View on Bags.fm <ExternalLink className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-body-md text-fg-secondary">
              No token launched yet.{" "}
              <Link href="/launch" className="text-primary-readable hover:underline">
                Launch on Bags.fm →
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <IncorporationStatusCard
        tokenMint={project.tokenMint}
        incorporation={incorporation}
        action={
          <StartIncorporationButton
            projectId={id}
            disabled={
              project.status !== "live" ||
              incorporation?.incorporationStarted === true
            }
          />
        }
      />

      <DexscreenerUpsellCard
        projectId={id}
        tokenMint={project.tokenMint}
        order={dexscreenerOrder}
      />

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>Claim history</CardTitle>
          <CardDescription>
            On-chain Bags fee claims that funded each payout.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {completed.length === 0 ? (
            <p className="px-6 py-8 text-center text-body-md text-fg-secondary">
              No completed claims yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {completed.map((p) => (
                <li
                  key={p.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-6 py-3 text-body-md"
                >
                  <div>
                    <div className="text-fg">
                      {p.executedAt ? formatRelativeTime(p.executedAt) : "—"}
                    </div>
                    <div className="text-caption text-fg-muted">
                      {p.recipientCount} recipient
                      {p.recipientCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="text-mono-md text-primary-readable">
                    {formatSol(p.totalLamports, 4)}
                  </div>
                  {p.claimSignature ? (
                    <Link
                      href={solscanTxUrl(p.claimSignature)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-mono-sm text-primary-readable hover:underline"
                    >
                      {formatAddress(p.claimSignature, 4, 4)}
                    </Link>
                  ) : (
                    <span className="text-mono-sm text-fg-muted">—</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-label-sm text-fg-secondary">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function Stub() {
  return (
    <div className="mx-auto w-full max-w-content">
      <EmptyState
        icon={Sparkles}
        title="Stub mode"
        description="Set DATABASE_URL or POSTGRES_URL to view token info."
      />
    </div>
  );
}
