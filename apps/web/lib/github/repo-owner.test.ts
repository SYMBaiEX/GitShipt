import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ accounts: [] as Array<{ accountId: string; accessToken: string | null }>, get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ dbHttp: { select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.accounts }) }) }) } }));
vi.mock("@octokit/rest", () => ({ Octokit: class { repos = { get: mocks.get }; } }));
import { requirePersonalRepoOwner, validatePersonalRepoOwner } from "./repo-owner";

describe("personal repository owner verification", () => {
  const repo = { id: 100, private: false, owner: { id: 42, login: "owner", type: "User" } };
  it("uses immutable account and repository IDs", () => {
    expect(validatePersonalRepoOwner(repo, "42", "100")).toEqual({ githubAccountId: "42", login: "owner" });
    expect(() => validatePersonalRepoOwner(repo, "43", "100")).toThrow(/owner/);
    expect(() => validatePersonalRepoOwner(repo, "42", "101")).toThrow(/identity changed/);
    expect(() => validatePersonalRepoOwner({ ...repo, owner: { ...repo.owner, login: "owner" } }, "43", "100")).toThrow();
  });
  it("rejects organizations, private repositories and malformed responses", () => {
    expect(() => validatePersonalRepoOwner({ ...repo, owner: { ...repo.owner, type: "Organization" } }, "42", "100")).toThrow();
    expect(() => validatePersonalRepoOwner({ ...repo, private: true }, "42", "100")).toThrow();
    expect(() => validatePersonalRepoOwner({}, "42", "100")).toThrow();
  });
  it("requires an unambiguous linked GitHub token and verifies the live response", async () => {
    const args = { userId: "u", ghOwner: "owner", ghRepo: "repo", ghRepoId: "100" };
    mocks.accounts = [];
    await expect(requirePersonalRepoOwner(args)).rejects.toMatchObject({ code: "github_credentials_required" });
    mocks.accounts = [{ accountId: "42", accessToken: null }];
    await expect(requirePersonalRepoOwner(args)).rejects.toMatchObject({ code: "github_credentials_required" });
    mocks.accounts = [{ accountId: "42", accessToken: "token" }, { accountId: "43", accessToken: "token" }];
    await expect(requirePersonalRepoOwner(args)).rejects.toMatchObject({ code: "github_credentials_required" });
    mocks.accounts = [{ accountId: "42", accessToken: "token" }];
    mocks.get.mockResolvedValueOnce({ data: repo });
    await expect(requirePersonalRepoOwner(args)).resolves.toEqual({ githubAccountId: "42", login: "owner" });
    mocks.get.mockRejectedValueOnce(new Error("network"));
    await expect(requirePersonalRepoOwner(args)).rejects.toMatchObject({ code: "github_verification_failed" });
  });
});
