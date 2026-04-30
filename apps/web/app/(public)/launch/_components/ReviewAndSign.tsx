"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Pencil,
  Rocket,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
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
import { SignInWithSolanaFlow } from "@/components/wallet/SignInWithSolanaFlow";

export interface ReviewAndSignProps {
  repo: GithubRepo;
  metadata: TokenMetadataInput;
  leaderboard: LeaderboardConfig;
  launchWalletAddress: string | null;
  walletConnected: boolean;
  walletLinked: boolean;
  walletLinkChecking: boolean;
  walletLinkError: string | null;
  onWalletLinked: (address: string) => void;
  initialBuyLamports: number;
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
  launchWalletAddress,
  walletConnected,
  walletLinked,
  walletLinkChecking,
  walletLinkError,
  onWalletLinked,
  initialBuyLamports,
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
  const launchCostLabel =
    initialBuyLamports > 0
      ? `${(initialBuyLamports / LAMPORTS_PER_SOL_NUMBER).toFixed(4)} SOL`
      : "0.0000 SOL";
  const canLaunch =
    isStubMode ||
    (walletConnected &&
      launchWalletAddress &&
      walletLinked &&
      !walletLinkChecking);

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
              label="Initial buy"
              value={<span className="text-mono-sm">{launchCostLabel}</span>}
            />
            <StatusLine
              label="Launch signer"
              value={
                launchWalletAddress ? (
                  <span className="text-mono-sm">
                    {truncateWallet(launchWalletAddress)}
                  </span>
                ) : (
                  "Wallet required"
                )
              }
            />
          </div>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-lg border border-border-strong bg-surface-elevated p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-primary-readable" />
            <div className="min-w-0 space-y-3">
              <div>
                <h3 className="text-label-md text-fg">Launch manifest</h3>
                <p className="mt-1 text-body-sm text-fg-secondary">
                  GitShipt prepares Bags metadata and fee sharing on the server.
                  Your linked wallet signs the final launch transaction and pays
                  the initial buy shown by the wallet.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <ReadinessPill
                  ready
                  label="GitHub repo admin"
                  icon={<GitBranch />}
                />
                <ReadinessPill
                  ready={isStubMode || walletLinked}
                  label={
                    isStubMode
                      ? "Test wallet bypass"
                      : walletLinked
                        ? "Wallet linked"
                        : walletLinkChecking
                          ? "Checking wallet"
                          : "Wallet signature needed"
                  }
                  icon={<WalletCards />}
                />
                <ReadinessPill
                  ready
                  label="Fee split totals 100%"
                  icon={<CheckCircle2 />}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          {isStubMode || (launchWalletAddress && walletLinked) ? (
            <div className="space-y-2">
              <p className="text-label-md text-fg">
                {isStubMode ? "Test launch mode" : "Wallet ready"}
              </p>
              <p className="text-body-sm text-fg-secondary">
                {isStubMode
                  ? "No real Bags transaction will be broadcast."
                  : "You will review the launch transaction in your wallet before it is sent."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {walletLinkChecking ? (
                <p className="text-body-sm text-fg-secondary">
                  Checking whether this wallet is already linked...
                </p>
              ) : walletLinkError ? (
                <p className="rounded-md bg-danger-soft/50 px-3 py-2 text-body-sm text-danger">
                  {walletLinkError}
                </p>
              ) : null}
              <SignInWithSolanaFlow
                key={launchWalletAddress ?? "disconnected-wallet"}
                autoRequest={walletConnected && !walletLinkChecking}
                continueHref={null}
                onLinked={onWalletLinked}
              />
            </div>
          )}
        </div>
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
          disabled={isPending || !canLaunch}
          className="w-full sm:w-auto"
        >
          {isPending ? (
            <Spinner size="default" color="inherit" />
          ) : (
            <Rocket className="size-4" />
          )}
          {isStubMode ? "Run test launch" : "Review in wallet"}
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

function ReadinessPill({
  ready,
  label,
  icon,
}: {
  ready: boolean;
  label: string;
  icon: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-body-sm",
        ready
          ? "border-success/30 bg-success-soft/30 text-fg"
          : "border-warning/30 bg-warning-soft/30 text-fg",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center [&>svg]:size-4",
          ready ? "text-success" : "text-warning",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 text-wrap">{label}</span>
    </div>
  );
}

function truncateWallet(address: string): string {
  return address.length <= 12
    ? address
    : `${address.slice(0, 4)}...${address.slice(-4)}`;
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
