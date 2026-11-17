import "server-only";
import { Octokit } from "@octokit/rest";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { dbHttp } from "@/db";
import { accounts } from "@/db/schema";

const RepoSchema = z.object({
  id: z.number().int().positive().safe(),
  private: z.literal(false),
  owner: z.object({
    id: z.number().int().positive().safe(),
    login: z.string().min(1),
    type: z.literal("User"),
  }),
});

export class RepoOwnerError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "RepoOwnerError";
  }
}

export function validatePersonalRepoOwner(
  response: unknown,
  githubAccountId: string,
  ghRepoId: string,
): { githubAccountId: string; login: string } {
  const parsed = RepoSchema.safeParse(response);
  if (!parsed.success) throw new RepoOwnerError("unsupported_repository", 403, "Owner rewards require a public repository owned by a personal GitHub account.");
  if (String(parsed.data.id) !== ghRepoId) throw new RepoOwnerError("repo_identity_changed", 409, "Repository identity changed; select it again.");
  if (String(parsed.data.owner.id) !== githubAccountId) throw new RepoOwnerError("not_repo_owner", 403, "Only the personal repository owner can launch owner rewards.");
  return { githubAccountId, login: parsed.data.owner.login };
}

export async function requirePersonalRepoOwner(args: {
  userId: string;
  ghOwner: string;
  ghRepo: string;
  ghRepoId: string;
}): Promise<{ githubAccountId: string; login: string }> {
  const linked = await dbHttp.select({ accountId: accounts.accountId, accessToken: accounts.accessToken })
    .from(accounts).where(and(eq(accounts.userId, args.userId), eq(accounts.providerId, "github"))).limit(2);
  if (linked.length !== 1 || !linked[0]?.accessToken) {
    throw new RepoOwnerError("github_credentials_required", 401, "Sign in with a linked GitHub account to verify repository ownership.");
  }
  const account = linked[0];
  let response: unknown;
  try {
    const octokit = new Octokit({ auth: account.accessToken! });
    response = (await octokit.repos.get({ owner: args.ghOwner, repo: args.ghRepo })).data;
  } catch {
    throw new RepoOwnerError("github_verification_failed", 502, "Could not verify repository ownership with GitHub.");
  }
  return validatePersonalRepoOwner(response, account.accountId, args.ghRepoId);
}
