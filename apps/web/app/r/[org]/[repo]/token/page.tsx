import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Coins } from "lucide-react";
import { getProjectPageData } from "@/lib/queries/project-page";
import {
  getTokenClaimEvents,
  getTokenCreators,
  getTokenStats,
} from "@/lib/queries/token-stats";
import { BagsAnalyticsCard } from "@/components/bags/BagsAnalyticsCard";
import { TradingPanel } from "@/components/bags/TradingPanel";
import { SolanaWalletProvider } from "@/components/providers/SolanaWalletProvider";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { TokenInfoCard } from "../_components/TokenInfoCard";
import { CopyButton } from "@/components/shared";
import { formatSol, formatAddress } from "@repo/lib";
import { clusterLabel, solscanTokenUrl } from "@/lib/solana/explorer";

type Params = Promise<{ org: string; repo: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) return { title: `${org}/${repo} · Token` };
  const symbol = data.header.tokenMint
    ? data.header.ghRepo.toUpperCase().slice(0, 8)
    : null;
  return {
    title: `${data.header.name}${symbol ? ` · $${symbol}` : ""} · Token`,
    description: `Token detail page for ${data.header.slug} on Bags.fm.`,
  };
}

export default function ProjectTokenPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ProjectTokenPageContent params={params} />
    </Suspense>
  );
}

async function ProjectTokenPageContent({ params }: { params: Params }) {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) notFound();

  const { header } = data;
  const stats = await getTokenStats(header);
  const hasLiveToken =
    header.tokenMint &&
    (header.status === "live" || header.status === "tracked");
  const [creators, claimEvents] = hasLiveToken
    ? await Promise.all([
        getTokenCreators(header.id, header.tokenMint!),
        getTokenClaimEvents(header.id, header.tokenMint!, 5),
      ])
    : [[], []];
  const platformFeePct = (header.platformFeeBps / 100).toFixed(1);
  const contributorPoolPct = ((10_000 - header.platformFeeBps) / 100).toFixed(
    1,
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/explore" },
          {
            label: header.name,
            href: `/r/${header.ghOwner}/${header.ghRepo}`,
          },
          { label: "Token" },
        ]}
      />

      {!hasLiveToken || !stats || !header.tokenMint ? (
        <Card depth="raised" padding="default" className="text-center">
          <Coins className="mx-auto size-10 text-fg-muted" aria-hidden />
          <CardTitle className="mt-3 justify-center">
            {header.status === "launch_configured"
              ? "Launch configured"
              : "No token launched"}
          </CardTitle>
          <CardDescription className="mt-1 mx-auto max-w-md">
            {header.status === "launch_configured"
              ? "Bags token metadata and fee sharing are configured, but the final launch transaction has not been broadcast yet."
              : `${header.ghOwner}/${header.ghRepo} hasn't been minted on Bags.fm yet. The owner can launch from the dashboard to start the daily fee pool.`}
          </CardDescription>
          <Button asChild variant="primary" size="default" className="mt-4">
            <Link href="/launch">Launch a token</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-4">
            <BagsAnalyticsCard
              stats={stats}
              pool={data.pool}
              recentPayouts={data.recentPayouts}
              creatorCount={creators.length}
              claimEvents={claimEvents}
            />

            <Card depth="raised" padding="default">
              <CardHeader>
                <CardTitle>Token economics</CardTitle>
              </CardHeader>
              <CardContent className="mt-4 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric
                    label="Platform fee"
                    value={`${platformFeePct}%`}
                    detail={`${header.platformFeeBps} bps`}
                  />
                  <Metric
                    label="Contributor pool"
                    value={`${contributorPoolPct}%`}
                    detail={`${10_000 - header.platformFeeBps} bps`}
                    accent
                  />
                  <Metric
                    label="Top-N"
                    value={String(header.payoutConfig.topN)}
                    detail="paid"
                  />
                  <Metric
                    label="Min payout"
                    value={formatSol(
                      BigInt(header.payoutConfig.claimThresholdLamports),
                      2,
                    )}
                    detail="threshold"
                  />
                </div>

                <div className="border-t border-border pt-4">
                  <div className="mb-2 text-label-sm text-fg-secondary">
                    Payout weights
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {header.payoutConfig.tierWeights.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-surface/40 px-3 py-2"
                      >
                        <span className="text-caption text-fg-muted">
                          #{i + 1}
                        </span>
                        <span className="text-mono-sm text-fg">
                          {(w * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 border-t border-border pt-4 md:grid-cols-3">
                  <TokenMeta label="Mint">
                    <span
                      className="truncate text-mono-sm text-fg"
                      title={header.tokenMint}
                    >
                      {formatAddress(header.tokenMint, 6, 6)}
                    </span>
                    <CopyButton
                      value={header.tokenMint}
                      label="Copy contract address"
                    />
                    <Link
                      href={solscanTokenUrl(header.tokenMint)}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label="View on Solscan"
                      className="gb-control gb-control-icon gb-control-ghost inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:text-fg"
                    >
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </TokenMeta>
                  {header.bagsLaunchId ? (
                    <TokenMeta label="Launch">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <span
                          className="truncate text-mono-sm text-fg-secondary"
                          title={header.bagsLaunchId}
                        >
                          {formatAddress(header.bagsLaunchId, 8, 4)}
                        </span>
                        <CopyButton
                          value={header.bagsLaunchId}
                          label="Copy Bags launch id"
                        />
                      </span>
                    </TokenMeta>
                  ) : null}
                  <TokenMeta label="Cluster">
                    <Badge variant="warning" size="sm">
                      {clusterLabel()}
                    </Badge>
                  </TokenMeta>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <SolanaWalletProvider>
              <TradingPanel
                projectId={header.id}
                symbol={stats.symbol}
                tokenMint={header.tokenMint}
              />
            </SolanaWalletProvider>
            <TokenInfoCard
              stats={stats}
              ghOwner={header.ghOwner}
              ghRepo={header.ghRepo}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 px-4 py-3">
      <div className="text-caption text-fg-muted">{label}</div>
      <div
        className={`mt-1 text-mono-md ${accent ? "text-primary-readable" : "text-fg"}`}
      >
        {value}
      </div>
      <div className="text-caption text-fg-muted">{detail}</div>
    </div>
  );
}

function TokenMeta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/40 bg-surface-elevated/40 px-3 py-2">
      <div className="text-caption text-fg-muted">{label}</div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}
