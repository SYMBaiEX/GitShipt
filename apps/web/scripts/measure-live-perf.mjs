import { chromium } from "playwright";

const base = new URL(process.argv[2] ?? "https://gitshipt.com");
const samples = Number(process.argv[3] ?? 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 10) {
  throw new Error("Sample count must be an integer between 1 and 10.");
}

const browser = await chromium.launch();
const report = {
  origin: base.origin,
  runAt: new Date().toISOString(),
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
      for (const entry of list.getEntries())
        window.gitshiptMetrics.lcp = entry.startTime;
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
          : url.pathname === "/_next/image"
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
          : Math.round(window.gitshiptMetrics.lcp),
      loadMs: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      clsApprox: Number(window.gitshiptMetrics.shift.toFixed(3)),
    };
  });
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
  const { context, page } = await mobilePage();
  try {
    await page.goto(base.href, { waitUntil: "networkidle" });
    const dock = page.getByRole("navigation", { name: "Quick navigation" });
    for (const [label, path, title] of [
      ["Explore", "/explore", "Explore projects"],
      ["Ranks", "/leaderboard", "Global leaderboard"],
      ["Explore", "/explore", "Explore projects"],
    ]) {
      const origin = await page.evaluate(() => performance.timeOrigin);
      await page.evaluate(() => {
        document.addEventListener(
          "click",
          () => {
            window.gitshiptClick = performance.now();
          },
          { once: true, capture: true },
        );
      });
      await dock.getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL((url) => url.pathname === path);
      await page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor();
      report.navigation.push({
        destination: path,
        ...(await page.evaluate(
          (previousOrigin) => ({
            sameDocument: performance.timeOrigin === previousOrigin,
            headingMs:
              window.gitshiptClick === undefined
                ? null
                : Math.round(performance.now() - window.gitshiptClick),
          }),
          origin,
        )),
      });
      await page.waitForLoadState("networkidle");
    }
  } finally {
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
