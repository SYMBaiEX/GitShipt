import { expect, test, type Page } from "@playwright/test";

async function captureRouteMotion(page: Page) {
  await page.addInitScript(() => {
    const motion: string[] = [];
    Object.defineProperty(window, "routeMotionNames", { value: motion });
    const scan = () => {
      for (const animation of document.getAnimations()) {
        if (
          animation instanceof CSSAnimation &&
          animation.animationName.startsWith("gb-route-")
        ) {
          motion.push(animation.animationName);
        }
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  });
}

function observedMotion(page: Page) {
  return page.evaluate(
    () =>
      (window as Window & { routeMotionNames?: string[] }).routeMotionNames ??
      [],
  );
}

test("mobile route changes animate the viewport and keep the dock in place", async ({
  page,
}) => {
  await captureRouteMotion(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const dock = page.getByRole("navigation", { name: "Quick navigation" });
  const originalDock = await dock.elementHandle();
  const explore = dock.getByRole("link", { name: "Explore" });
  let documentNavigations = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentNavigations++;
  });

  await explore.click();
  await expect(
    page.getByRole("heading", { name: "Explore projects" }),
  ).toBeVisible();
  await expect(explore).toHaveAttribute("aria-current", "page");
  await expect.poll(() => observedMotion(page)).toContain("gb-route-in");
  const selection = dock.locator(".gb-dock-selection");
  await expect
    .poll(async () => {
      const [active, marker] = await Promise.all([
        explore.boundingBox(),
        selection.boundingBox(),
      ]);
      return Math.abs((active?.x ?? 0) - (marker?.x ?? -100));
    })
    .toBeLessThan(1);
  expect(
    await dock.evaluate(
      (current, original) => current === original,
      originalDock,
    ),
  ).toBe(true);

  await page.goBack();
  await expect(dock.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(documentNavigations).toBe(0);
});

test("reduced motion keeps route and dock updates immediate", async ({
  page,
}) => {
  await captureRouteMotion(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const dock = page.getByRole("navigation", { name: "Quick navigation" });
  await dock.getByRole("link", { name: "Explore" }).click();
  await expect(
    page.getByRole("heading", { name: "Explore projects" }),
  ).toBeVisible();
  await expect(dock.getByRole("link", { name: "Explore" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await observedMotion(page)).toEqual([]);
  expect(
    await dock
      .locator(".gb-dock-selection")
      .evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
});

test("Explore paints a prefetched heading before filtered results arrive", async ({
  page,
}) => {
  let release: () => void = () => {};
  const untilReleased = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/explore(?:\?.*)?$/, async (route) => {
    const headers = route.request().headers();
    if (headers.rsc === "1" && !headers["next-router-prefetch"])
      await untilReleased;
    await route.continue();
  });
  try {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Browse projects" }).click();
    await expect(
      page.getByRole("heading", { name: "Explore projects" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Loading projects" }),
    ).toBeAttached();
  } finally {
    release();
  }
  await expect(
    page.getByRole("status").filter({ hasText: "Loading projects" }),
  ).toHaveCount(0);
});
