import { chromium } from "playwright";

const base = new URL(process.argv[2] ?? "https://gitshipt.com");
const samples = Number(process.argv[3] ?? 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 10) {
  throw new Error("Sample count must be an integer between 1 and 10.");
}
const colorScheme = process.env.PERF_COLOR_SCHEME ?? "light";
if (colorScheme !== "light" && colorScheme !== "dark") {
  throw new Error("PERF_COLOR_SCHEME must be light or dark.");
}

const browser = await chromium.launch();
const report = {
  origin: base.origin,
  runAt: new Date().toISOString(),
  colorScheme,
  samples,
  cold: {},
  navigation: [],
  cache: {},
};
const access = (group, key) => (group[key] ??= {});
const increment = (group, key) => {
  group[key] = (group[key] ?? 0) + 1;
};

async function mobilePage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: 200_000,
    uploadThroughput: 95_000,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.gitshiptMetrics = { lcp: null, shift: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const image = entry.url && new URL(entry.url, location.href);
        window.gitshiptMetrics.lcp = {
          time: entry.startTime,
          element: entry.element?.tagName ?? null,
          image: image
            ? (image.searchParams.get("url") ?? image.pathname)
            : null,
        };
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.gitshiptMetrics.shift += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== base.origin) return;
    const headers = response.headers();
    const kind =
      response.request().resourceType() === "document"
        ? "document"
        : url.pathname.startsWith("/_next/static/")
          ? "static"
          : response.request().resourceType() === "image"
            ? "image"
            : headers["content-type"]?.includes("text/x-component")
              ? "rsc"
              : null;
    if (kind)
      increment(
        access(report.cache, kind),
        headers["x-vercel-cache"] ?? "not reported",
      );
  });
  return { context, page };
}

async function documentTiming(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      ttfbMs: Math.round(nav.responseStart),
      fcpMs: paint ? Math.round(paint.startTime) : null,
      lcpMs:
        window.gitshiptMetrics.lcp === null
          ? null
          : Math.round(window.gitshiptMetrics.lcp.time),
      lcpElement: window.gitshiptMetrics.lcp?.element ?? null,
      lcpImage: window.gitshiptMetrics.lcp?.image ?? null,
      loadMs: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      clsApprox: Number(window.gitshiptMetrics.shift.toFixed(3)),
    };
  });
}

async function measureNavigation(page, dock, { label, path, title, results }) {
  const from = new URL(page.url()).pathname;
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate(
    ({ path, title, results }) => {
      window.gitshiptNavigation = { headingMs: null, resultsMs: null };
      document.addEventListener(
        "click",
        () => {
          const startedAt = performance.now();
          const until = startedAt + 10_000;
          const measure = (now) => {
            if (location.pathname === path) {
              const elapsed = Math.round(now - startedAt);
              const content = document.querySelector("main");
              const heading = content?.querySelector("h1");
              if (
                heading?.textContent?.trim() === title &&
                heading.getClientRects().length
              ) {
                window.gitshiptNavigation.headingMs ??= elapsed;
              }
              if (
                results &&
                [...(content?.querySelectorAll('[role="status"]') ?? [])].some(
                  (element) =>
                    /^[\d,]+ projects?$/.test(
                      element.textContent?.trim() ?? "",
                    ) && element.getClientRects().length,
                )
              ) {
                window.gitshiptNavigation.resultsMs ??= elapsed;
              }
            }
            const { headingMs, resultsMs } = window.gitshiptNavigation;
            if (
              now < until &&
              (headingMs === null || (results && resultsMs === null))
            ) {
              requestAnimationFrame(measure);
            }
          };
          requestAnimationFrame(measure);
        },
        { once: true, capture: true },
      );
    },
    { path, title, results },
  );
  await dock.getByRole("link", { name: label, exact: true }).click();
  await page.waitForURL((url) => url.pathname === path);
  await page
    .getByRole("heading", { level: 1, name: title, exact: true })
    .waitFor();
  if (results) {
    await page
      .locator('main [role="status"]')
      .filter({ hasText: /^[\d,]+ projects?$/ })
      .waitFor();
  }
  await page.waitForFunction(
    ({ origin, results }) => {
      if (performance.timeOrigin !== origin) return true;
      const sample = window.gitshiptNavigation;
      return (
        sample?.headingMs != null && (!results || sample.resultsMs != null)
      );
    },
    { origin, results },
    { timeout: 10_000 },
  );
  return {
    from,
    destination: path,
    ...(await page.evaluate(
      (previousOrigin) => ({
        sameDocument: performance.timeOrigin === previousOrigin,
        headingMs: window.gitshiptNavigation?.headingMs ?? null,
        resultsMs: window.gitshiptNavigation?.resultsMs ?? null,
      }),
      origin,
    )),
  };
}

try {
  for (const path of ["/", "/explore", "/leaderboard"]) {
    report.cold[path] = [];
    for (let index = 0; index < samples; index++) {
      const { context, page } = await mobilePage();
      try {
        await page.goto(new URL(path, base).href, { waitUntil: "load" });
        await page.locator("main h1").first().waitFor();
        await page.waitForLoadState("networkidle");
        report.cold[path].push(await documentTiming(page));
      } finally {
        await context.close();
      }
    }
  }
  const explore = {
    label: "Explore",
    path: "/explore",
    title: "Explore projects",
    results: true,
  };
  const ranks = {
    label: "Ranks",
    path: "/leaderboard",
    title: "Global leaderboard",
    results: false,
  };
  for (let sample = 1; sample <= samples; sample++) {
    const { context, page } = await mobilePage();
    try {
      await page.goto(base.href, { waitUntil: "networkidle" });
      const dock = page.getByRole("navigation", { name: "Quick navigation" });
      for (const link of [explore, ranks, explore]) {
        report.navigation.push({
          sample,
          ...(await measureNavigation(page, dock, link)),
        });
        await page.waitForLoadState("networkidle");
      }
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
