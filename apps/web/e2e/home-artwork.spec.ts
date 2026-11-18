import { expect, test } from "@playwright/test";

test("mobile hero downloads only the saved theme and swaps on a theme change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  const downloaded: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.resourceType() === "image" &&
      /mia-(light|dark)/.test(url.href)
    ) {
      downloaded.push(url.pathname);
    }
  });

  await page.goto("/");
  const hero = page.locator(".gitshipt-mia-art:visible");
  const currentSource = () =>
    hero.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0 ? image.currentSrc : "",
    );
  await expect
    .poll(currentSource)
    .toMatch(/\/hero\/mia-light-[a-f0-9]{12}\.avif$/);
  await expect(
    page.locator('head link[rel="preload"][type="image/avif"]'),
  ).toHaveAttribute("href", /^\/hero\/mia-light-[a-f0-9]{12}\.avif$/);
  expect(downloaded).toEqual([
    expect.stringMatching(/^\/hero\/mia-light-[a-f0-9]{12}\.avif$/),
  ]);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "App navigation" });
  await drawer
    .getByRole("button", { name: /Theme: Light, click to switch to Dark/i })
    .click();
  await expect
    .poll(currentSource)
    .toMatch(/\/hero\/mia-dark-[a-f0-9]{12}\.avif$/);
});

test("desktop keeps the full responsive dark hero", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const hero = page.locator(".gitshipt-mia-art:visible");
  await expect
    .poll(() => hero.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toMatch(/\/_next\/image\?url=.*mia-dark.*\.png/);
  await expect(
    page.locator('head link[rel="preload"][type="image/avif"]'),
  ).toHaveCount(0);
});

test("mobile hero still renders the system theme without the preloader", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route(/\/hero\/preload-[a-f0-9]{12}\.js$/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  const hero = page.locator(".gitshipt-mia-art:visible");
  await expect
    .poll(() =>
      hero.evaluate((image: HTMLImageElement) =>
        image.complete && image.naturalWidth > 0 ? image.currentSrc : "",
      ),
    )
    .toMatch(/\/hero\/mia-dark-[a-f0-9]{12}\.avif$/);
});
