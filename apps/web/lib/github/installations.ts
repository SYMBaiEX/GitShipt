import "server-only";

import { appOctokit, installationOctokit } from "@/lib/github/app";
import {
  GitHubInstallationsSchema,
  GitHubRepositoriesSchema,
  resolveGitHubInstallationForRepo as resolveGitHubInstallationForRepoCore,
  type GitHubInstallationResolution,
  type InstallationSources,
  type ResolveGitHubInstallationInput,
} from "@/lib/github/installations-core";

export type { GitHubInstallationResolution };

export async function resolveGitHubInstallationForRepo(
  input: ResolveGitHubInstallationInput,
): Promise<GitHubInstallationResolution | null> {
  return resolveGitHubInstallationForRepoCore(input, githubInstallationSources());
}

function githubInstallationSources(): InstallationSources {
  return {
    async listInstallations() {
      const installations = await appOctokit().paginate(
        "GET /app/installations",
        { per_page: 100 },
      );
      return GitHubInstallationsSchema.parse(installations);
    },
    async listInstallationRepositories(installationId) {
      const octokit = await installationOctokit(installationId);
      const repositories = await octokit.paginate(
        "GET /installation/repositories",
        { per_page: 100 },
      );
      return GitHubRepositoriesSchema.parse(repositories);
    },
  };
}
