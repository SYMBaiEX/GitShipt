import { expect, test, type Page } from "@playwright/test";

const DEMO_PROJECT_PATH = "/r/SYMBaiEX/gitshipt";
const HYDRATION_RE =
  /hydration|hydrated|server rendered|server-rendered|did not match/i;
const HAS_E2E_DB = Boolean(
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_POSTGRES_URL ||
  process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL,
);
if (process.env.E2E_REQUIRE_DB === "1" && !HAS_E2E_DB) {
  throw new Error("E2E_REQUIRE_DB=1 requires a staging DATABASE_URL/POSTGRES_URL.");
}
const regressionTest = HAS_E2E_DB ? test : test.skip;

async function installLightTheme(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("theme", "light");
    document.documentElement.dataset.theme = "light";
  });
}

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

async function requireOkPage(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), path).toBe(200);
}

async function visibleTextContrastFailures(page: Page) {
  return await page.evaluate(() => {
    function parseRgb(color: string): [number, number, number, number] | null {
      const match = color.match(
        /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?\)$/,
      );
      if (!match) return null;
      return [
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        match[4] === undefined ? 1 : Number(match[4]),
      ];
    }

    function luminance([r, g, b]: [number, number, number]): number {
      const convert = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
    }

    function contrastRatio(
      foreground: [number, number, number],
      background: [number, number, number],
    ): number {
      const fg = luminance(foreground);
      const bg = luminance(background);
      const lighter = Math.max(fg, bg);
      const darker = Math.min(fg, bg);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function effectiveBackground(element: Element): [number, number, number] {
      let current: Element | null = element;
      while (current) {
        const parsed = parseRgb(getComputedStyle(current).backgroundColor);
        if (parsed && parsed[3] > 0) return [parsed[0], parsed[1], parsed[2]];
        current = current.parentElement;
      }
      return [255, 255, 255];
    }

    return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const text = element.innerText?.trim();
        if (!text) return false;
        if (element.children.length > 0) {
          const childText = Array.from(element.children)
            .map((child) => (child as HTMLElement).innerText?.trim() ?? "")
            .join(" ")
            .trim();
          if (childText === text) return false;
        }
        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const style = getComputedStyle(element);
        const foreground = parseRgb(style.color);
        if (!foreground) return null;
        const background = effectiveBackground(element);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10);
        const largeText =
          fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const minimum = largeText ? 3 : 4.5;
        const ratio = contrastRatio(
          [foreground[0], foreground[1], foreground[2]],
          background,
        );
        return {
          text: element.innerText.trim().slice(0, 80),
          selector:
            element.id ||
            element.getAttribute("class")?.toString().slice(0, 120) ||
            element.tagName.toLowerCase(),
          ratio: Number(ratio.toFixed(2)),
          minimum,
        };
      })
      .filter(
        (entry): entry is NonNullable<typeof entry> =>
          entry !== null && entry.ratio < entry.minimum,
      );
  });
}

test.describe("audit regression coverage", () => {
  regressionTest(
    "mobile project footer does not overlap the daily fee pool value",
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await requireOkPage(page, DEMO_PROJECT_PATH);

      const poolCard = page
        .getByRole("heading", { name: "Daily Fee Pool", level: 2 })
        .locator("xpath=ancestor::section[1]");
      await expect(poolCard).toBeVisible();
      await poolCard.scrollIntoViewIfNeeded();

      const layout = await page.evaluate(() => {
        const footer = document.querySelector("footer");
        const heading = Array.from(document.querySelectorAll("h2")).find(
          (el) => el.textContent?.trim() === "Daily Fee Pool",
        );
        const pool = heading?.closest("section") ?? null;
        const amount = pool
          ? Array.from(pool.querySelectorAll("div, span")).find((el) =>
              /\bSOL\b/.test(el.textContent ?? ""),
            )
          : null;

        if (!footer || !pool || !amount) return null;

        const footerBox = footer.getBoundingClientRect();
        const amountBox = amount.getBoundingClientRect();
        return {
          footerTop: footerBox.top,
          amountBottom: amountBox.bottom,
        };
      });

      expect(layout).not.toBeNull();
      expect(layout!.amountBottom).toBeLessThanOrEqual(layout!.footerTop);
    },
  );

  regressionTest(
    "explore hydrates without React mismatch warnings",
    async ({ page }) => {
      const hydrationProblems = captureHydrationProblems(page);

      await requireOkPage(page, "/explore");
      await expect(
        page.getByRole("searchbox", { name: "Search projects" }),
      ).toBeVisible();
      await page
        .getByRole("searchbox", { name: "Search projects" })
        .fill("git");
      await page.waitForTimeout(400);

      expect(hydrationProblems).toEqual([]);
    },
  );

  regressionTest(
    "public routes keep one descriptive h1 for route announcements",
    async ({ page }) => {
      const publicPaths = HAS_E2E_DB
        ? ["/", "/explore", DEMO_PROJECT_PATH]
        : ["/", "/explore"];
      for (const path of publicPaths) {
        await requireOkPage(page, path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      }
    },
  );

  regressionTest(
    "light theme keeps visible text above WCAG contrast thresholds",
    async ({ page }) => {
      await installLightTheme(page);
      await requireOkPage(page, "/explore");

      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(await visibleTextContrastFailures(page)).toEqual([]);
    },
  );

  regressionTest(
    "admin and project settings routes are gated without a session",
    async ({ page }) => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/auth\/signin\?next=%2Fadmin$/);

      await page.goto("/dashboard/projects/project_demo/settings");
      await expect(page).toHaveURL(
        /\/auth\/signin\?next=%2Fdashboard%2Fprojects%2Fproject_demo%2Fsettings$/,
      );
    },
  );
});
