import { beforeEach, describe, expect, test } from "vitest";
import {
  DEFAULT_LEADERBOARD,
  deriveSymbolFromRepo,
  useLaunchWizardStore,
} from "@/lib/state/launch-wizard-store";
import type { GithubRepo } from "@repo/shared";

const repo: GithubRepo = {
  id: "42",
  owner: "sym",
  name: "git-bags",
  fullName: "sym/git-bags",
  description: "Daily fee payouts for repo contributors",
  language: "TypeScript",
  stargazersCount: 12,
  forksCount: 3,
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/42?v=4",
  alreadyLaunched: false,
  draftProjectId: null,
  homepage: "https://gitshipt.dev",
  topics: ["solana", "bags"],
  license: "MIT",
  defaultBranch: "main",
};

describe("launch wizard store", () => {
  beforeEach(() => {
    useLaunchWizardStore.getState().reset();
  });

  test("selecting a repo seeds token metadata and advances the wizard", () => {
    useLaunchWizardStore.getState().selectRepo(repo);

    const state = useLaunchWizardStore.getState();
    expect(state.step).toBe(2);
    expect(state.repo?.fullName).toBe("sym/git-bags");
    expect(state.metadata).toMatchObject({
      name: "git-bags",
      symbol: "GB",
      description: repo.description,
      imageUrl: repo.ownerAvatarUrl,
      website: "https://gitshipt.dev",
    });
  });

  test("selecting a different repo refreshes token metadata defaults", () => {
    useLaunchWizardStore.getState().selectRepo(repo);
    useLaunchWizardStore.getState().setMetadata({
      name: "Custom token",
      symbol: "CUSTOM",
      description: "Edited metadata",
      imageUrl: repo.ownerAvatarUrl,
    });

    useLaunchWizardStore.getState().selectRepo({
      ...repo,
      id: "43",
      name: "open-source-launch-kit",
      fullName: "sym/open-source-launch-kit",
      description: null,
    });

    const state = useLaunchWizardStore.getState();
    expect(state.step).toBe(2);
    expect(state.metadata).toMatchObject({
      name: "open-source-launch-kit",
      symbol: "OSLK",
      description: "Token for sym/open-source-launch-kit.",
      imageUrl: repo.ownerAvatarUrl,
      website: "https://gitshipt.dev",
    });
  });

  test("derives compact ticker samples from common repo name patterns", () => {
    expect(deriveSymbolFromRepo("git-bags")).toBe("GB");
    expect(deriveSymbolFromRepo("repoLaunchKit")).toBe("RLK");
    expect(deriveSymbolFromRepo("singlewordrepo")).toBe("SINGLEWORD");
  });

  test("repo homepage missing a scheme is upgraded to https before becoming the default website", () => {
    useLaunchWizardStore.getState().selectRepo({
      ...repo,
      homepage: "example.com",
    });
    expect(useLaunchWizardStore.getState().metadata?.website).toBe(
      "https://example.com",
    );
  });

  test("repo with no homepage leaves the website field undefined", () => {
    useLaunchWizardStore.getState().selectRepo({
      ...repo,
      homepage: null,
    });
    expect(useLaunchWizardStore.getState().metadata?.website).toBeUndefined();
  });

  test("reset clears user-specific launch state", () => {
    useLaunchWizardStore.getState().selectRepo(repo);
    useLaunchWizardStore.getState().startSubmit();
    useLaunchWizardStore.getState().failSubmit("Nope");

    useLaunchWizardStore.getState().reset();

    expect(useLaunchWizardStore.getState()).toMatchObject({
      step: 1,
      repo: null,
      metadata: null,
      leaderboard: DEFAULT_LEADERBOARD,
      rewardMode: "owner",
      status: "idle",
      errorMessage: null,
      success: null,
      draftProjectId: null,
    });
  });

  test("hydrating from a draft seeds repo + metadata + leaderboard and lands on review", () => {
    const seed = useLaunchWizardStore.getState();
    seed.hydrateFromDraft({
      projectId: "proj_abc",
      repo,
      metadata: {
        name: "git-bags",
        symbol: "GITSHIPT",
        description: "Resumed",
        imageUrl: repo.ownerAvatarUrl,
      },
      leaderboard: DEFAULT_LEADERBOARD,
      rewardMode: "contributors",
    });

    const state = useLaunchWizardStore.getState();
    expect(state.draftProjectId).toBe("proj_abc");
    expect(state.step).toBe(4);
    expect(state.repo?.fullName).toBe("sym/git-bags");
    expect(state.metadata?.description).toBe("Resumed");
    expect(state.rewardMode).toBe("contributors");
    state.setRewardMode("owner");
    expect(useLaunchWizardStore.getState().rewardMode).toBe("owner");
  });

  test("succeedSubmit clears draftProjectId so post-launch saves don't target a stale draft", () => {
    useLaunchWizardStore.getState().selectRepo(repo);
    useLaunchWizardStore.getState().setDraftProjectId("proj_old");
    useLaunchWizardStore.getState().succeedSubmit({
      projectId: "proj_old",
      tokenMint: "Mint11111111111111111111111111111111111111",
      status: "live",
      txSig: null,
      stub: false,
      ghOwner: "sym",
      ghRepo: "git-bags",
    });
    expect(useLaunchWizardStore.getState().draftProjectId).toBeNull();
  });

  test("records a stub-mode launch success without losing project routing data", () => {
    useLaunchWizardStore.getState().selectRepo(repo);
    useLaunchWizardStore.getState().setMetadata({
      name: "git-bags",
      symbol: "GITSHIPT",
      description:
        repo.description ?? "Daily fee payouts for repo contributors",
      imageUrl: repo.ownerAvatarUrl,
    });
    useLaunchWizardStore.getState().setLeaderboard(DEFAULT_LEADERBOARD);
    useLaunchWizardStore.getState().startSubmit();

    useLaunchWizardStore.getState().succeedSubmit({
      projectId: "project_1",
      tokenMint: "StubMint111111111111111111111111111111111",
      status: "simulated_live",
      txSig: null,
      configKey: "stub_config_key",
      stub: true,
      note: "Stub mode — token mint is fake; no on-chain transaction sent.",
      ghOwner: repo.owner,
      ghRepo: repo.name,
    });

    expect(useLaunchWizardStore.getState()).toMatchObject({
      step: 4,
      status: "idle",
      errorMessage: null,
      success: {
        projectId: "project_1",
        status: "simulated_live",
        stub: true,
        txSig: null,
        ghOwner: "sym",
        ghRepo: "git-bags",
      },
    });
  });
});
