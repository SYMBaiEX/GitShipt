import { z } from "zod";

const GitHubInstallationSchema = z
  .object({
    id: z.number().int().positive(),
    account: z
      .object({
        login: z.string().min(1),
      })
      .loose()
      .nullable(),
    repository_selection: z.enum(["all", "selected"]),
  })
  .loose();

const GitHubRepositorySchema = z
  .object({
    name: z.string().min(1),
    full_name: z.string().min(1).optional(),
    owner: z
      .object({
        login: z.string().min(1),
      })
      .loose(),
  })
  .loose();

export const GitHubInstallationsSchema = z.array(GitHubInstallationSchema);
export const GitHubRepositoriesSchema = z.array(GitHubRepositorySchema);

type GitHubInstallation = z.infer<typeof GitHubInstallationSchema>;
type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

export interface InstallationSources {
  listInstallations: () => Promise<GitHubInstallation[]>;
  listInstallationRepositories: (
    installationId: string,
  ) => Promise<GitHubRepository[]>;
}

export interface GitHubInstallationResolution {
  installationId: string;
  accountLogin: string;
  repositorySelection: "all" | "selected";
}

export interface ResolveGitHubInstallationInput {
  owner: string;
  repo: string;
}

export async function resolveGitHubInstallationForRepo(
  input: ResolveGitHubInstallationInput,
  sources: InstallationSources,
): Promise<GitHubInstallationResolution | null> {
  const owner = input.owner.toLowerCase();
  const repo = input.repo.toLowerCase();
  const installations = await sources.listInstallations();

  for (const installation of installations) {
    const accountLogin = installation.account?.login;
    if (!accountLogin || accountLogin.toLowerCase() !== owner) continue;

    if (installation.repository_selection === "all") {
      return {
        installationId: String(installation.id),
        accountLogin,
        repositorySelection: "all",
      };
    }

    const repositories = await sources.listInstallationRepositories(
      String(installation.id),
    );
    const hasRepository = repositories.some((repository) => {
      const repositoryOwner = repository.owner.login.toLowerCase();
      const repositoryName = repository.name.toLowerCase();
      return repositoryOwner === owner && repositoryName === repo;
    });

    if (hasRepository) {
      return {
        installationId: String(installation.id),
        accountLogin,
        repositorySelection: "selected",
      };
    }
  }

  return null;
}
