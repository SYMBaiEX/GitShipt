"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowLeft, Pencil, Rocket, WalletCards } from "lucide-react";
import { cn } from "@repo/lib";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { Spinner } from "@repo/ui";
import {
  LAMPORTS_PER_SOL_NUMBER,
  type GithubRepo,
  type TokenMetadataInput,
} from "@repo/shared";
import type { LeaderboardConfig } from "@/lib/state/launch-wizard-store";

export interface ReviewAndSignProps {
  repo: GithubRepo;
  metadata: TokenMetadataInput;
  leaderboard: LeaderboardConfig;
  onBack: () => void;
  onEditRepo: () => void;
  onEditToken: () => void;
  onEditLeaderboard: () => void;
  onLaunch: () => void;
  isPending: boolean;
  isStubMode: boolean;
}

export function ReviewAndSign({
  repo,
  metadata,
  leaderboard,
  onBack,
  onEditRepo,
  onEditToken,
  onEditLeaderboard,
  onLaunch,
  isPending,
  isStubMode,
}: ReviewAndSignProps) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const isDevnet = cluster !== "mainnet-beta";

  const platformFeePct = (leaderboard.platformFeeBps / 100).toFixed(2);
  const claimThresholdSol = (
    leaderboard.claimThresholdLamports / LAMPORTS_PER_SOL_NUMBER
  ).toFixed(4);
  const tierSum = leaderboard.tierWeights.reduce((a, b) => a + b, 0);
  const contributorPoolPct = (100 - leaderboard.platformFeeBps / 100).toFixed(
    2,
  );

  return (
    <div className="space-y-5">
      <h2 className="text-headline-sm">Review launch</h2>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 rounded-lg border border-border-strong bg-surface-elevated p-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
            <Image
              src={repo.ownerAvatarUrl}
              alt=""
              width={44}
              height={44}
              className="size-11 shrink-0 rounded-lg bg-surface"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-headline-sm text-fg">
                  {metadata.name}
                </span>
                <span className="rounded-md border border-border bg-surface px-2 py-1 text-mono-sm text-fg-secondary">
                  ${metadata.symbol}
                </span>
              </div>
              <p className="mt-1 truncate text-body-sm text-fg-secondary">
                {repo.fullName}
                {repo.description ? ` · ${repo.description}` : ""}
              </p>
              <dl className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
                <SummaryMetric
                  label="Contributors"
                  value={`${topNLabel(leaderboard.topN)}`}
                />
                <SummaryMetric
                  label="Window"
                  value={`${leaderboard.windowDays}d`}
                />
                <SummaryMetric
                  label="Min payout"
                  value={`${claimThresholdSol} SOL`}
                />
              </dl>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditRepo}
              className="self-start text-fg-secondary hover:text-fg"
            >
              <Pencil className="size-3.5" />
              Repo
            </Button>
          </div>
        </div>

        <aside className="space-y-3 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2 text-label-md text-fg">
            <span className="inline-flex items-center gap-2">
              <WalletCards className="size-4 text-fg-muted" aria-hidden />
              Fees after launch
            </span>
            <Badge
              variant={isDevnet ? "warning" : "default"}
              dot
              dotColor={isDevnet ? "warning" : undefined}
              size="sm"
            >
              {isStubMode ? "Test" : cluster}
            </Badge>
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <StatusLine
              label="Contributor pool"
              value={
                <span className="text-mono-sm">{contributorPoolPct}%</span>
              }
            />
            <StatusLine
              label="GitShipt treasury"
              value={<span className="text-mono-sm">{platformFeePct}%</span>}
            />
            <StatusLine
              label="Launch cost"
              value={<span className="text-mono-sm">~0.05 SOL</span>}
            />
            <StatusLine label="Fee claimer" value="Contributor pool wallet" />
          </div>
        </aside>
      </section>

      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        <ReviewSection title="Token" onEdit={onEditToken}>
          <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Row k="Name" v={metadata.name} />
            <Row k="Symbol" v={metadata.symbol} mono />
            {metadata.description ? (
              <Row k="Description" v={metadata.description} truncate full />
            ) : null}
            <Row k="Image" v={metadata.imageUrl} truncate full />
            <Row k="Links" v={tokenLinks(metadata)} truncate full />
          </dl>
        </ReviewSection>

        <ReviewSection title="Leaderboard" onEdit={onEditLeaderboard}>
          <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Row k="Scoring window" v={`${leaderboard.windowDays} days`} mono />
            <Row k="Paid ranks" v={String(leaderboard.topN)} mono />
            <Row k="Platform fee" v={`${platformFeePct}%`} mono />
            <Row k="Contributor pool" v={`${contributorPoolPct}%`} mono />
            <Row
              k="Rank split"
              v={`${(tierSum * 100).toFixed(1)}%`}
              mono
              full
            />
          </dl>
        </ReviewSection>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isPending}
          className="justify-center sm:justify-start"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={onLaunch}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? (
            <Spinner size="default" color="inherit" />
          ) : (
            <Rocket className="size-4" />
          )}
          {isStubMode ? "Run test launch" : "Launch"}
        </Button>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="mt-1 truncate text-mono-md text-fg">{value}</dd>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-caption text-fg-muted">{label}</div>
      <div className="min-w-0 truncate text-right text-body-sm text-fg">
        {value}
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-label-md text-fg">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}

function topNLabel(topN: number): string {
  return `Top ${topN}`;
}

function tokenLinks(metadata: TokenMetadataInput): string {
  const links = [
    metadata.website ? "Website" : null,
    metadata.twitter ? "X" : null,
    metadata.telegram ? "Telegram" : null,
  ].filter(Boolean);
  return links.length > 0 ? links.join(" / ") : "None";
}

function Row({
  k,
  v,
  mono,
  truncate,
  full,
}: {
  k: string;
  v: string;
  mono?: boolean;
  truncate?: boolean;
  full?: boolean;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", full && "sm:col-span-2")}>
      <dt className="text-caption text-fg-muted">{k}</dt>
      <dd
        className={cn(
          "min-w-0 text-body-sm text-fg",
          mono && "text-mono-md",
          truncate && "truncate",
        )}
        title={truncate ? v : undefined}
      >
        {v}
      </dd>
    </div>
  );
}
