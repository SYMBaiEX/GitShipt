import { expect, test, type Page } from "@playwright/test";

/**
 * DexScreener upgrade upsell — smoke coverage.
 *
 * The full happy path requires:
 *   1. an authenticated session,
 *   2. a connected wallet adapter, and
 *   3. a SIWS-bound wallet row matching the connected pubkey.
 *
 * None of those fixtures exist in this repo's e2e setup yet. Instead this
 * spec asserts the surfaces compile and behave correctly at the framework
 * boundary:
 *
 *   - Public launch page still renders (regression: our bundle changes do
 *     not crash the wizard host page).
 *   - Dashboard token page redirects unauthenticated visitors to /auth/signin
 *     (regression: the new card import did not break the route handler).
 *   - The route shell does not throw a hydration error.
 *
 * When auth fixtures land we should extend this spec to: sign in, navigate
 * to a seeded project's token page, click "Upgrade page", submit the dialog
 * in stub mode, and assert the success badge appears.
 */

const HAS_E2E_DB = Boolean(
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_POSTGRES_URL ||
  process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL,
);
const dbTest = HAS_E2E_DB ? test : test.skip;

const HYDRATION_RE =
  /hydration|hydrated|server rendered|server-rendered|did not match/i;

function captureHydrationProblems(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (HYDRATION_RE.test(text)) messages.push(text);
  });
  page.on("pageerror", (error) => {
    if (HYDRATION_RE.test(error.message)) messages.push(error.message);
  });
  return messages;
}

dbTest("public /launch still renders after dexscreener wiring", async ({ page }) => {
  const hydrationProblems = captureHydrationProblems(page);
  const response = await page.goto("/launch", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  expect(hydrationProblems).toEqual([]);
});

dbTest("/dashboard/projects/[id]/token redirects unauthenticated visitors", async ({
  page,
}) => {
  // The exact id does not matter — the route guard runs before any data
  // fetch, so we should land on /auth/signin regardless of whether the
  // project exists.
  const response = await page.goto(
    "/dashboard/projects/proj_nonexistent_smoketest/token",
    { waitUntil: "domcontentloaded" },
  );
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/auth\/signin/);
});
