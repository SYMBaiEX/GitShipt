import { expect, test } from "@playwright/test";

test.describe("mobile application shell", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("sign-in failure is announced and can be retried", async ({ page }) => {
    await page.route("**/api/auth/sign-in/social", (route) =>
      route.fulfill({
        status: 503,
        json: { message: "GitHub sign-in is unavailable. Please try again." },
      }),
    );
    await page.goto("/auth/signin");
    await expect(page.getByRole("main")).toHaveCount(1);
    const signIn = page.getByRole("button", { name: "Continue with GitHub" });
    await signIn.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "GitHub sign-in is unavailable" }),
    ).toBeVisible();
    await expect(signIn).toBeEnabled();
  });

  test("skip link works and closed navigation has no off-screen tab stops", async ({
    page,
  }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-gitshipt-sidebar]")).toBeHidden();
  });

  test("drawer is modal, traps focus, and restores the opener on Escape", async ({
    page,
  }) => {
    await page.goto("/explore");
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "App navigation" });
    await expect(drawer).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Quick navigation" }),
    ).toHaveCount(0);
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press(i >= 9 ? "Shift+Tab" : "Tab");
      expect(
        await drawer.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("navigation stays reachable in landscape and switching to desktop closes it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/docs");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Privacy" }).click();
    await expect(
      page.getByRole("heading", { name: "Privacy Policy", level: 1 }),
    ).toBeVisible();
    await expect(drawer).not.toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(drawer).not.toBeVisible();
    await expect(page.locator("[data-gitshipt-sidebar]")).toBeVisible();
  });

  test("drawer close stays in the header and the footer can scroll into view", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 920, height: 1193 });
    await page.goto("/docs");
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "App navigation" });
    const header = drawer.locator("[data-sidebar-header]");
    const close = drawer.getByRole("button", { name: "Close", exact: true });

    async function expectCloseInHeader() {
      await expect(close).toBeInViewport({ ratio: 1 });
      const headerBox = (await header.boundingBox())!;
      const closeBox = (await close.boundingBox())!;
      expect(closeBox.width).toBeGreaterThanOrEqual(44);
      expect(closeBox.height).toBeGreaterThanOrEqual(44);
      expect(closeBox.x).toBeGreaterThanOrEqual(headerBox.x);
      expect(closeBox.y).toBeGreaterThanOrEqual(headerBox.y);
      expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(
        headerBox.x + headerBox.width,
      );
      expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(
        headerBox.y + headerBox.height,
      );
    }

    await expectCloseInHeader();
    await expect(drawer).toHaveCSS("background-image", "none");
    await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCSS(
      "backdrop-filter",
      "none",
    );
    await page.setViewportSize({ width: 844, height: 280 });
    const privacy = drawer.getByRole("link", { name: "Privacy", exact: true });
    await privacy.scrollIntoViewIfNeeded();
    await expect(privacy).toBeInViewport({ ratio: 1 });
    await expectCloseInHeader();
    await close.click();
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("small screens reflow and the dock does not cover content", async ({
    page,
  }) => {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 768 });
      for (const route of [
        "/",
        "/explore",
        "/leaderboard",
        "/launch",
        "/docs",
      ]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const main = page.locator("#main-content");
        expect(
          await main.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1,
          ),
          route,
        ).toBe(true);
        const dock = page.getByRole("navigation", { name: "Quick navigation" });
        const contentBox = (await main.boundingBox())!;
        const dockBox = (await dock.boundingBox())!;
        expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(
          dockBox.y + 1,
        );
        expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(769);
        expect(
          await dock
            .getByRole("link")
            .first()
            .evaluate((el) => el.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("quick navigation indicates the page and respects reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const dock = page.getByRole("navigation", { name: "Quick navigation" });
    await dock.getByRole("link", { name: "Launch" }).click();
    await expect(dock.getByRole("link", { name: "Launch" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("heading", { name: "Launch a repo token", level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog");
    expect(
      await drawer.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
    ).toBe("none");
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).not.toBeVisible();
  });
});
