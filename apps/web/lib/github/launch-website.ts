export function launchWebsite(
  owner: string,
  repo: string,
  website?: string | null,
): string {
  return (
    website?.trim() ||
    `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  );
}
