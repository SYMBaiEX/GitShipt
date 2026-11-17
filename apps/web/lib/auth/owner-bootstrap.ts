export const OWNER_GITHUB_ACCOUNT_ID = "192078165";

export function selectOwnerAccount(
  accounts: Array<{ id: string; role: string; providerId: string; accountId: string }>,
): { id: string; role: string } {
  const matches = accounts.filter(
    (account) => account.providerId === "github" && account.accountId === OWNER_GITHUB_ACCOUNT_ID,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one linked SYMBaiEX GitHub account; found ${matches.length}. Sign in with GitHub first.`);
  }
  return matches[0]!;
}
