"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookmarkPlus,
  CheckCircle2,
  FlaskConical,
  Rocket,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@repo/lib";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { Card, CardDescription, CardTitle } from "@repo/ui";
import { Spinner } from "@repo/ui";
import { FormError } from "@/components/shared/FormError";
import { RepoPicker } from "./RepoPicker";
import { TokenMetadataForm } from "./TokenMetadataForm";
import { LeaderboardConfigForm } from "./LeaderboardConfigForm";
import { ReviewAndSign } from "./ReviewAndSign";
import { DexscreenerOrderDialog } from "@/components/bags/DexscreenerOrderDialog";
import { DEXSCREENER_PRICE_USDC } from "@repo/shared";
import { createAndLaunchAction, saveDraftAction } from "../actions";
import {
  DEFAULT_SCORING_CONFIG,
  defaultTierWeights,
  type CreateProjectBody,
  type ScoringConfigInput,
  type PayoutConfigInput,
  type GithubRepo,
} from "@repo/shared";
import {
  useLaunchWizardStore,
  type LaunchSuccess,
  type LaunchWizardStep,
  type LeaderboardConfig,
} from "@/lib/state/launch-wizard-store";

export interface DraftHydration {
  projectId: string;
  ghOwner: string;
  ghRepo: string;
  ghRepoId: string;
  ghInstallationId: string | null;
  name: string;
  symbol: string | null;
  description: string | null;
  imageUrl: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  platformFeeBps: number;
  scoringConfig: ScoringConfigInput;
  payoutConfig: PayoutConfigInput;
}

/**
 * The wizard tracks two real states during submit:
 *   - "idle"        : the form is interactive
 *   - "submitting"  : the server action is in flight (single round-trip)
 *
 * The previous implementation faked a 5-step ladder with setTimeout(250).
 * That misled the user into believing each Bags step was happening live,
 * when in reality the action is one round-trip server-side. Removed.
 */
export interface WizardShellProps {
  signedIn: boolean;
  /** Server-rendered: true when BAGS_API_KEY is missing (stub mode). */
  isStubMode: boolean;
  /** Server-loaded draft to resume. Null for a fresh wizard run. */
  draft: DraftHydration | null;
}

export function WizardShell({ signedIn, isStubMode, draft }: WizardShellProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; createdNew: boolean }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const step = useLaunchWizardStore((state) => state.step);
  const repo = useLaunchWizardStore((state) => state.repo);
  const metadata = useLaunchWizardStore((state) => state.metadata);
  const leaderboard = useLaunchWizardStore((state) => state.leaderboard);
  const status = useLaunchWizardStore((state) => state.status);
  const errorMessage = useLaunchWizardStore((state) => state.errorMessage);
  const success = useLaunchWizardStore((state) => state.success);
  const draftProjectId = useLaunchWizardStore((state) => state.draftProjectId);
  const goToStep = useLaunchWizardStore((state) => state.goToStep);
  const selectRepo = useLaunchWizardStore((state) => state.selectRepo);
  const setMetadata = useLaunchWizardStore((state) => state.setMetadata);
  const setLeaderboard = useLaunchWizardStore((state) => state.setLeaderboard);
  const startSubmit = useLaunchWizardStore((state) => state.startSubmit);
  const failSubmit = useLaunchWizardStore((state) => state.failSubmit);
  const succeedSubmit = useLaunchWizardStore((state) => state.succeedSubmit);
  const setDraftProjectId = useLaunchWizardStore(
    (state) => state.setDraftProjectId,
  );
  const hydrateFromDraft = useLaunchWizardStore(
    (state) => state.hydrateFromDraft,
  );
  const clearError = useLaunchWizardStore((state) => state.clearError);
  const reset = useLaunchWizardStore((state) => state.reset);

  useEffect(() => {
    if (!signedIn) reset();
  }, [reset, signedIn]);

  // One-shot hydration when arriving with ?draftId=...
  useEffect(() => {
    if (!draft) return;
    if (draftProjectId === draft.projectId) return;
    hydrateFromDraft({
      projectId: draft.projectId,
      repo: draftRepoShim(draft),
      metadata: {
        name: draft.name,
        symbol: draft.symbol ?? "",
        description: draft.description ?? "",
        imageUrl: draft.imageUrl ?? "",
        website: draft.website ?? "",
        twitter: draft.twitter ?? "",
        telegram: draft.telegram ?? "",
      },
      leaderboard: leaderboardFromConfig(
        draft.scoringConfig,
        draft.payoutConfig,
        draft.platformFeeBps,
      ),
    });
  }, [draft, draftProjectId, hydrateFromDraft]);

  async function handleLaunch() {
    if (!repo || !metadata) {
      failSubmit("Missing repo or token metadata. Restart the wizard.");
      return;
    }

    startSubmit();

    const body: CreateProjectBody = {
      ghRepoId: repo.id,
      ghOwner: repo.owner,
      ghRepo: repo.name,
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      website:
        metadata.website && metadata.website.length > 0
          ? metadata.website
          : undefined,
      twitter:
        metadata.twitter && metadata.twitter.length > 0
          ? metadata.twitter
          : undefined,
      telegram:
        metadata.telegram && metadata.telegram.length > 0
          ? metadata.telegram
          : undefined,
      scoringConfig: {
        ...DEFAULT_SCORING_CONFIG,
        windowDays: leaderboard.windowDays,
      },
      payoutConfig: {
        topN: leaderboard.topN,
        tierWeights: leaderboard.tierWeights,
        claimThresholdLamports: leaderboard.claimThresholdLamports,
      },
      platformFeeBps: leaderboard.platformFeeBps,
    };

    // Fresh idempotency key per click so we never replay a cached result
    // from a prior failed/incomplete attempt on the same (user, repo) pair
    // (TTL is 24h on the server). React's useTransition + isPending state
    // already prevents concurrent in-flight clicks within a single render.
    const idempotencyKey = `wizard-${crypto.randomUUID()}`;

    startTransition(async () => {
      try {
        const result = await createAndLaunchAction(body, idempotencyKey);

        if (!result.ok) {
          const message = formatActionError(result.error, result.message);
          failSubmit(message);
          // Inline FormError stays put for context, toast surfaces the
          // failure persistently in case the user scrolled.
          toast.error(message);
          return;
        }

        succeedSubmit({
          projectId: result.projectId,
          tokenMint: result.tokenMint,
          status: result.status,
          txSig: result.txSig,
          configKey: result.configKey,
          stub: result.stub,
          note: result.note,
          ghOwner: result.ghOwner,
          ghRepo: result.ghRepo,
        });
        // Success state replaces the wizard with <LaunchResult>; no toast
        // needed (would be redundant with the page-level success view).
      } catch (e) {
        const message = e instanceof Error ? e.message : "Launch failed.";
        failSubmit(message);
        toast.error(message);
      }
    });
  }

  /**
   * Persist current wizard state as a draft project. The button is only
   * surfaced once we have enough data to satisfy the create body — repo +
   * metadata at minimum. Leaderboard falls back to defaults when the user
   * hasn't visited step 3 yet.
   */
  async function handleSaveDraft() {
    if (!repo || !metadata) {
      const message = "Pick a repo and fill the token metadata before saving.";
      setSaveState({ status: "error", message });
      toast.error(message);
      return;
    }
    setSaveState({ status: "saving" });
    const body: CreateProjectBody = {
      ghRepoId: repo.id,
      ghOwner: repo.owner,
      ghRepo: repo.name,
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      website: metadata.website || undefined,
      twitter: metadata.twitter || undefined,
      telegram: metadata.telegram || undefined,
      scoringConfig: {
        ...DEFAULT_SCORING_CONFIG,
        windowDays: leaderboard.windowDays,
      },
      payoutConfig: {
        topN: leaderboard.topN,
        tierWeights: leaderboard.tierWeights,
        claimThresholdLamports: leaderboard.claimThresholdLamports,
      },
      platformFeeBps: leaderboard.platformFeeBps,
    };

    try {
      const result = await saveDraftAction(body, draftProjectId ?? undefined);
      if (!result.ok) {
        setSaveState({ status: "error", message: result.message });
        toast.error(result.message);
        return;
      }
      setDraftProjectId(result.projectId);
      // Reflect the active draft in the URL so a refresh resumes correctly.
      const url = new URL(window.location.href);
      url.searchParams.set("draftId", result.projectId);
      window.history.replaceState({}, "", url.toString());
      setSaveState({ status: "saved", createdNew: result.created });
      toast.success(result.created ? "Draft saved" : "Draft updated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed.";
      setSaveState({ status: "error", message });
      toast.error(message);
    }
  }

  function handleRetry() {
    clearError();
  }

  function handleViewProject() {
    if (!success) return;
    router.push(`/r/${success.ghOwner}/${success.ghRepo}`);
  }

  // ============================================================
  // Render
  // ============================================================

  if (success) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:py-6">
        <h1 className="sr-only">Launch a repo token</h1>
        <LaunchResult result={success} onViewProject={handleViewProject} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:py-6">
      <h1 className="sr-only">Launch a repo token</h1>
      <StepIndicator current={step} />

      {draft ? (
        <DraftResumeBanner ghOwner={draft.ghOwner} ghRepo={draft.ghRepo} />
      ) : null}

      <section
        className={cn(
          "mt-3 rounded-lg border border-border bg-surface/70 p-4 lg:p-5",
        )}
      >
        {!signedIn ? (
          <SignedOutPrompt />
        ) : status === "submitting" ? (
          <SubmittingState />
        ) : step === 1 ? (
          <RepoPicker onSelect={selectRepo} selectedId={repo?.id ?? null} />
        ) : step === 2 && repo ? (
          <>
            {errorMessage ? (
              <FormError
                message={errorMessage}
                onDismiss={handleRetry}
                className="mb-4"
              />
            ) : null}
            <TokenMetadataForm
              repo={repo}
              initial={metadata}
              onBack={() => goToStep(1)}
              onSubmit={setMetadata}
            />
          </>
        ) : step === 3 ? (
          <>
            {errorMessage ? (
              <FormError
                message={errorMessage}
                onDismiss={handleRetry}
                className="mb-4"
              />
            ) : null}
            <LeaderboardConfigForm
              initial={leaderboard}
              onBack={() => goToStep(2)}
              onSubmit={setLeaderboard}
            />
          </>
        ) : step === 4 && repo && metadata ? (
          <>
            {isStubMode ? <TestModeBanner className="mb-4" /> : null}
            {errorMessage ? (
              <FormError
                message={errorMessage}
                onDismiss={handleRetry}
                className="mb-4"
              />
            ) : null}
            <ReviewAndSign
              repo={repo}
              metadata={metadata}
              leaderboard={leaderboard}
              onBack={() => goToStep(3)}
              onEditRepo={() => goToStep(1)}
              onEditToken={() => goToStep(2)}
              onEditLeaderboard={() => goToStep(3)}
              onLaunch={handleLaunch}
              isPending={false}
              isStubMode={isStubMode}
            />
          </>
        ) : (
          <p className="text-body-md text-fg-muted">
            Pick a repo first to continue.
          </p>
        )}
      </section>

      {signedIn && step >= 2 && repo && metadata ? (
        <SaveDraftBar
          state={saveState}
          draftProjectId={draftProjectId}
          isSubmitting={status === "submitting"}
          onSave={handleSaveDraft}
        />
      ) : null}
    </div>
  );
}

function DraftResumeBanner({
  ghOwner,
  ghRepo,
}: {
  ghOwner: string;
  ghRepo: string;
}) {
  return (
    <Card depth="flat" padding="sm" className="mt-4 bg-info-soft/40">
      <div className="flex items-start gap-3">
        <Badge variant="info" size="sm" dot>
          Resuming draft
        </Badge>
        <p className="flex-1 text-body-sm text-fg-secondary">
          Picking up where you left off on{" "}
          <span className="text-mono-sm text-fg">
            {ghOwner}/{ghRepo}
          </span>
          . Edit any step or hit launch when you&rsquo;re ready.
        </p>
      </div>
    </Card>
  );
}

function SaveDraftBar({
  state,
  draftProjectId,
  isSubmitting,
  onSave,
}: {
  state:
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; createdNew: boolean }
    | { status: "error"; message: string };
  draftProjectId: string | null;
  isSubmitting: boolean;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
      {state.status === "error" ? (
        <span className="text-body-sm text-danger">{state.message}</span>
      ) : null}
      {state.status === "saved" ? (
        <span className="text-body-sm text-fg-muted">
          {state.createdNew ? "Draft saved." : "Draft updated."}
        </span>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onSave}
        disabled={state.status === "saving" || isSubmitting}
      >
        {state.status === "saving" ? (
          <Spinner size="default" color="inherit" />
        ) : (
          <BookmarkPlus className="size-4" />
        )}
        {draftProjectId ? "Save draft" : "Save as draft"}
      </Button>
    </div>
  );
}

// ============================================================
// Hydration helpers
// ============================================================

function draftRepoShim(draft: DraftHydration): GithubRepo {
  // The wizard's GithubRepo shape is richer than the projects table; for
  // resumed drafts we synthesize a minimal version from stored columns plus
  // GitHub's stable per-user avatar redirect. Step 1 isn't shown after
  // hydration so the missing rich fields (stars/topics/language) are not
  // load-bearing — they only feed badges in the metadata form, and the
  // metadata form itself is already populated from the draft.
  return {
    id: draft.ghRepoId,
    owner: draft.ghOwner,
    name: draft.ghRepo,
    fullName: `${draft.ghOwner}/${draft.ghRepo}`,
    description: draft.description,
    language: null,
    stargazersCount: 0,
    forksCount: 0,
    ownerAvatarUrl: `https://github.com/${draft.ghOwner}.png`,
    alreadyLaunched: false,
    draftProjectId: null,
    homepage: null,
    topics: [],
    license: null,
    defaultBranch: null,
  };
}

function leaderboardFromConfig(
  scoring: ScoringConfigInput,
  payout: PayoutConfigInput,
  platformFeeBps: number,
): LeaderboardConfig {
  // Defensive: payoutConfig.tierWeights should already match topN, but if a
  // legacy draft drifted we regenerate from the canonical defaults.
  const tierWeights =
    payout.tierWeights.length === payout.topN
      ? payout.tierWeights
      : defaultTierWeights(payout.topN);
  return {
    windowDays: scoring.windowDays,
    topN: payout.topN,
    tierWeights,
    claimThresholdLamports: payout.claimThresholdLamports,
    platformFeeBps,
  };
}

// ============================================================
// Submitting state — single honest spinner, no fake ladder
// ============================================================

function SubmittingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col items-center justify-center gap-4 py-10 text-center"
    >
      <Spinner size="lg" color="primary" label="Creating project" />
      <div className="space-y-1">
        <p className="text-headline-sm">Creating project…</p>
        <p className="text-body-sm text-fg-secondary">
          Talking to Bags and persisting your launch. This usually takes a few
          seconds — keep this tab open.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Success result
// ============================================================

function LaunchResult({
  result,
  onViewProject,
}: {
  result: LaunchSuccess;
  onViewProject: () => void;
}) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const solscanUrl = solscanTxUrl(result.txSig, cluster);
  const mintExplorerUrl = solscanAddressUrl(result.tokenMint, cluster);

  return (
    <Card depth="raised" padding="lg" className="space-y-6">
      <header className="flex flex-col items-center gap-3 text-center">
        {result.stub ? (
          <span className="grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
            <FlaskConical className="size-6" aria-hidden />
          </span>
        ) : (
          <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-6" aria-hidden />
          </span>
        )}
        <CardTitle>
          {result.stub
            ? "Test launch recorded"
            : result.status === "launch_configured"
              ? "Launch configuration recorded"
              : "Token launched"}
        </CardTitle>
        <CardDescription>
          {result.stub
            ? "No real Bags.fm token was created. We persisted a test draft so you can preview the project page UX."
            : result.status === "launch_configured"
              ? "Bags token metadata and fee-share config are ready. The project will not enter payout rotation until the final launch transaction is broadcast."
              : "Your project is live on Bags.fm and now appears on the public leaderboard."}
        </CardDescription>
      </header>

      {result.stub || result.status === "launch_configured" ? (
        <Card depth="flat" padding="default" className="bg-warning-soft/40">
          <div className="flex items-start gap-3">
            <Badge variant="warning" dot dotColor="warning">
              {result.stub ? "Test mode" : "Needs launch tx"}
            </Badge>
            <p className="flex-1 text-body-sm text-fg-secondary">
              {result.note ??
                "BAGS_API_KEY is not set, so the token mint above is a stub. Configure the key to enable real launches."}
            </p>
          </div>
        </Card>
      ) : null}

      <dl className="grid grid-cols-1 gap-3">
        <ResultRow
          k="Token mint"
          v={result.tokenMint}
          href={mintExplorerUrl}
          mono
        />
        {result.txSig ? (
          <ResultRow k="Launch tx" v={result.txSig} href={solscanUrl} mono />
        ) : !result.stub ? (
          <ResultRow
            k="Launch tx"
            v="Pending — final Bags launch transaction was not broadcast."
          />
        ) : null}
        {result.configKey ? (
          <ResultRow k="Bags config key" v={result.configKey} mono />
        ) : null}
      </dl>

      <DexscreenerUpsellRow result={result} />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {!result.stub && solscanUrl ? (
          <Button asChild variant="secondary">
            <a href={solscanUrl} target="_blank" rel="noreferrer noopener">
              View on Solscan
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        ) : null}
        <Button onClick={onViewProject} variant="primary">
          <Rocket className="size-4" />
          Open project page
        </Button>
      </div>
    </Card>
  );
}

function DexscreenerUpsellRow({ result }: { result: LaunchSuccess }) {
  // The upsell is shown for every successful launch, including stub mode,
  // so QA can walk the dialog → server-action path end-to-end without a
  // real Bags key. The dialog itself short-circuits to stub_paid when the
  // server action returns { stub: true }.
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-border bg-surface-elevated/40 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-readable">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div>
          <p className="text-label-md text-fg">
            Upgrade your DexScreener page
          </p>
          <p className="text-caption text-fg-muted">
            <span className="text-mono-sm text-fg">
              ${DEXSCREENER_PRICE_USDC}
            </span>{" "}
            pay-once · SOL or USDC · Bags collects
          </p>
        </div>
      </div>
      <DexscreenerOrderDialog
        projectId={result.projectId}
        tokenMint={result.tokenMint}
        trigger={
          <Button variant="secondary" size="sm">
            Upgrade now
          </Button>
        }
      />
    </div>
  );
}

function ResultRow({
  k,
  v,
  href,
  mono,
}: {
  k: string;
  v: string;
  href?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <dt className="text-body-sm text-fg-muted">{k}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 truncate text-right text-body-sm text-fg",
          mono && "text-mono-sm",
        )}
        title={v}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary-readable hover:underline"
          >
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

// ============================================================
// Test-mode banner (Review step)
// ============================================================

export function TestModeBanner({ className }: { className?: string }) {
  return (
    <Card
      depth="flat"
      padding="sm"
      className={cn(
        "flex items-start gap-3 border-warning/40 bg-warning-soft/40",
        className,
      )}
    >
      <FlaskConical
        className="mt-0.5 size-4 shrink-0 text-warning"
        aria-hidden
      />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="warning" size="sm">
            Test mode
          </Badge>
          <span className="text-label-sm text-fg">
            No real Bags.fm token will be created
          </span>
        </div>
        <p className="text-body-sm text-fg-secondary">
          BAGS_API_KEY is not configured on this deployment. Submitting will
          persist a project draft with a fake mint so you can walk the rest of
          the flow end-to-end.
        </p>
      </div>
    </Card>
  );
}

// ============================================================
// Step indicator
// ============================================================

function StepIndicator({ current }: { current: LaunchWizardStep }) {
  const steps = [1, 2, 3, 4] as const;
  const labels: Record<LaunchWizardStep, string> = {
    1: "Repo",
    2: "Token",
    3: "Leaderboard",
    4: "Launch",
  };
  return (
    <ol
      className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none]"
      aria-label="Wizard steps"
    >
      {steps.map((s) => {
        const state =
          s < current ? "done" : s === current ? "current" : "future";
        return (
          <li key={s} className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-mono-sm font-medium",
                state === "current" &&
                  "bg-primary text-primary-fg shadow-inset-light",
                state === "done" &&
                  "border border-success bg-success-soft text-success",
                state === "future" &&
                  "border border-border-strong text-fg-muted",
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              {s}
            </span>
            <span
              className={cn(
                "text-label-sm whitespace-nowrap",
                state === "current" && "text-fg",
                state === "done" && "text-fg-secondary",
                state === "future" && "text-fg-muted",
              )}
            >
              {labels[s]}
            </span>
            {s < 4 ? (
              <span
                className={cn(
                  "mx-1 h-px w-6 sm:w-12",
                  state === "done" ? "bg-success" : "bg-border",
                )}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function SignedOutPrompt() {
  return (
    <div className="space-y-4">
      <h2 className="text-headline-sm">Sign in to continue</h2>
      <p className="text-body-md text-fg-secondary">
        You need to be signed in with GitHub before you can launch a token.
      </p>
      <Button asChild>
        <Link href="/auth/signin?next=/launch">Sign in with GitHub</Link>
      </Button>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatActionError(code: string, message: string): string {
  switch (code) {
    case "rate_limited":
      return "Too many launches. Wait an hour and try again.";
    case "unauthorized":
      return "You're signed out. Refresh and sign in again.";
    case "not_admin":
      return "You don't have admin permission on that repo.";
    case "already_exists":
      return message;
    case "no_github_token":
      return "GitHub token expired. Sign out and sign back in.";
    default:
      return message || "Launch failed.";
  }
}

function solscanTxUrl(sig: string | null, cluster: string): string | null {
  if (!sig) return null;
  const param = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://solscan.io/tx/${sig}${param}`;
}

function solscanAddressUrl(addr: string, cluster: string): string {
  const param = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://solscan.io/address/${addr}${param}`;
}
