import { describe, expect, it } from "vitest";

import { resolveGitHubInstallationForRepo } from "./installations-core";

describe("resolveGitHubInstallationForRepo", () => {
  it("resolves an all-repositories installation for the owner", async () => {
    const resolved = await resolveGitHubInstallationForRepo(
      { owner: "SYMBaiEX", repo: "GitShipt" },
      {
        async listInstallations() {
          return [
            {
              id: 123,
              account: { login: "SYMBaiEX" },
              repository_selection: "all",
            },
          ];
        },
        async listInstallationRepositories() {
          throw new Error("all-repositories installs do not need repo listing");
        },
      },
    );

    expect(resolved).toEqual({
      installationId: "123",
      accountLogin: "SYMBaiEX",
      repositorySelection: "all",
    });
  });

  it("resolves a selected-repository installation only when the repo is included", async () => {
    const resolved = await resolveGitHubInstallationForRepo(
      { owner: "SYMBaiEX", repo: "GitShipt" },
      {
        async listInstallations() {
          return [
            {
              id: 456,
              account: { login: "SYMBaiEX" },
              repository_selection: "selected",
            },
          ];
        },
        async listInstallationRepositories() {
          return [
            {
              name: "GitShipt",
              full_name: "SYMBaiEX/GitShipt",
              owner: { login: "SYMBaiEX" },
            },
          ];
        },
      },
    );

    expect(resolved?.installationId).toBe("456");
    expect(resolved?.repositorySelection).toBe("selected");
  });

  it("returns null when the app is installed but not for the project repo", async () => {
    const resolved = await resolveGitHubInstallationForRepo(
      { owner: "SYMBaiEX", repo: "GitShipt" },
      {
        async listInstallations() {
          return [
            {
              id: 789,
              account: { login: "SYMBaiEX" },
              repository_selection: "selected",
            },
          ];
        },
        async listInstallationRepositories() {
          return [
            {
              name: "other-repo",
              full_name: "SYMBaiEX/other-repo",
              owner: { login: "SYMBaiEX" },
            },
          ];
        },
      },
    );

    expect(resolved).toBeNull();
  });
});
