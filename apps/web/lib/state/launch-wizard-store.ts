"use client";

import { create } from "zustand";
import {
  DEFAULT_CLAIM_THRESHOLD_LAMPORTS,
  DEFAULT_MAX_CLAIMERS,
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_STEADY_STATE_CADENCE_HOURS,
  DEFAULT_TOP_N,
  DEFAULT_WINDOW_DAYS,
  defaultTierWeights,
  type GithubRepo,
  type SteadyStateCadenceHours,
  type TokenMetadataInput,
} from "@repo/shared";

export type LaunchWizardStep = 1 | 2 | 3 | 4;
export type LaunchStatus = "idle" | "submitting";

export interface LeaderboardConfig {
  windowDays: number;
  topN: number;
  tierWeights: number[];
  claimThresholdLamports: number;
  platformFeeBps: number;
  /**
   * v1.1 — hours between on-chain BPS rebalances after the 24h-then-3d
   * ramp-up. The wizard's CadenceSelector writes 72/120/168 here; the
   * launch action persists it onto payout_schedules.steadyStateCadenceHours.
   */
  steadyStateCadenceHours: SteadyStateCadenceHours;
  /**
   * v1.1 — maximum contributor claimer slots filled at launch. Bags
   * fee-share-v2 caps this at 100; we default to 50 to keep BPS
   * allocations meaningful.
   */
  maxClaimers: number;
}

export interface LaunchSuccess {
  projectId: string;
  tokenMint: string;
  status: "launch_configured" | "live" | "simulated_live";
  txSig: string | null;
  configKey?: string;
  stub: boolean;
  note?: string;
  ghOwner: string;
  ghRepo: string;
}

export const DEFAULT_LEADERBOARD: LeaderboardConfig = {
  windowDays: DEFAULT_WINDOW_DAYS,
  topN: DEFAULT_TOP_N,
  tierWeights: defaultTierWeights(DEFAULT_TOP_N),
  claimThresholdLamports: DEFAULT_CLAIM_THRESHOLD_LAMPORTS,
  platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
  steadyStateCadenceHours: DEFAULT_STEADY_STATE_CADENCE_HOURS,
  maxClaimers: DEFAULT_MAX_CLAIMERS,
};

export interface DraftHydrationInput {
  projectId: string;
  repo: GithubRepo;
  metadata: TokenMetadataInput;
  leaderboard: LeaderboardConfig;
}

interface LaunchWizardState {
  step: LaunchWizardStep;
  repo: GithubRepo | null;
  metadata: TokenMetadataInput | null;
  leaderboard: LeaderboardConfig;
  status: LaunchStatus;
  errorMessage: string | null;
  success: LaunchSuccess | null;
  /** Active draft DB id. Set when the user saves or resumes a draft. */
  draftProjectId: string | null;
  goToStep: (step: LaunchWizardStep) => void;
  selectRepo: (repo: GithubRepo) => void;
  setMetadata: (metadata: TokenMetadataInput) => void;
  setLeaderboard: (leaderboard: LeaderboardConfig) => void;
  startSubmit: () => void;
  failSubmit: (message: string) => void;
  succeedSubmit: (success: LaunchSuccess) => void;
  setDraftProjectId: (id: string | null) => void;
  hydrateFromDraft: (input: DraftHydrationInput) => void;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  step: 1 as LaunchWizardStep,
  repo: null,
  metadata: null,
  leaderboard: DEFAULT_LEADERBOARD,
  status: "idle" as LaunchStatus,
  errorMessage: null,
  success: null,
  draftProjectId: null,
};

export const useLaunchWizardStore = create<LaunchWizardState>((set) => ({
  ...initialState,
  goToStep: (step) => set({ step, errorMessage: null }),
  selectRepo: (repo) =>
    set((state) => ({
      repo,
      metadata:
        state.repo?.id === repo.id && state.metadata
          ? state.metadata
          : deriveTokenMetadataDefaults(repo),
      step: 2,
      errorMessage: null,
    })),
  setMetadata: (metadata) =>
    set({ metadata, step: 3, errorMessage: null }),
  setLeaderboard: (leaderboard) =>
    set({ leaderboard, step: 4, errorMessage: null }),
  setDraftProjectId: (id) => set({ draftProjectId: id }),
  hydrateFromDraft: ({ projectId, repo, metadata, leaderboard }) =>
    set({
      draftProjectId: projectId,
      repo,
      metadata,
      leaderboard,
      // Land on step 4 (Review) — every previous step has data to edit if the
      // user wants to change anything, but the default is "you can launch now".
      step: 4,
      errorMessage: null,
      status: "idle",
      success: null,
    }),
  startSubmit: () =>
    set({ status: "submitting", errorMessage: null, success: null }),
  failSubmit: (message) =>
    set({ status: "idle", errorMessage: message }),
  succeedSubmit: (success) =>
    set({
      status: "idle",
      success,
      errorMessage: null,
      // The draft has been promoted to live/launch_configured; clear the id so
      // any stray "Save draft" click after success doesn't try to PATCH a
      // non-draft row.
      draftProjectId: null,
    }),
  clearError: () => set({ errorMessage: null }),
  reset: () => set(initialState),
}));

export function resetLaunchWizardStore(): void {
  useLaunchWizardStore.getState().reset();
}

export function deriveTokenMetadataDefaults(
  repo: GithubRepo,
): TokenMetadataInput {
  return {
    name: repo.name.slice(0, 32),
    symbol: deriveSymbolFromRepo(repo.name),
    description: defaultDescription(repo),
    imageUrl: repo.ownerAvatarUrl,
    website: validUrlOrUndefined(repo.homepage),
  };
}

export function deriveSymbolFromRepo(repoName: string): string {
  const parts = repoName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const acronym =
    parts.length > 1
      ? parts.map((part) => part[0]).join("")
      : (parts[0] ?? repoName);
  const cleaned = acronym.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fallback = repoName.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned || fallback).slice(0, 10) || "GSHIPT";
}

function defaultDescription(repo: GithubRepo): string {
  const description = repo.description?.trim();
  if (description) return description.slice(0, 1000);
  return `Token for ${repo.owner}/${repo.name}. Fees redistribute to top contributors daily.`;
}

function validUrlOrUndefined(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // GitHub homepage is often "example.com" without a scheme. The Bags
  // schema requires a full URL, so prepend https:// when missing.
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}
