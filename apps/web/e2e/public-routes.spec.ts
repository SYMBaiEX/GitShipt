import { expect, test } from "@playwright/test";

test.describe("public routing", () => {
  test("renders public routes and redirects protected routes", async ({
    page,
  }) => {
    for (const route of ["/", "/explore", "/leaderboard", "/launch", "/docs"]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
    }

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/signin\?next=%2Fdashboard$/);
  });

  test("dashboard earnings route redirects instead of 404ing", async ({
    page,
  }) => {
    const response = await page.goto("/dashboard/earnings");
    expect(response?.status()).not.toBe(404);
    await expect(page).toHaveURL(
      /\/auth\/signin\?next=%2Fdashboard%2Fearnings$/,
    );
  });

  test("openapi spec documents production integration routes", async ({
    request,
  }) => {
    const response = await request.get("/api/openapi.json");
    expect(response.status()).toBe(200);
    const spec = await response.json();

    for (const route of [
      "/api/projects/{id}/launch",
      "/api/projects/{id}/install-github",
      "/api/projects/{id}/incorporation/start",
      "/api/projects/{id}/trading/quote",
      "/api/projects/{id}/api-keys",
    ]) {
      expect(spec.paths, route).toHaveProperty(route);
    }
  });

  test("seo primitives are available to crawlers and install surfaces", async ({
    request,
  }) => {
    const [robots, sitemap, manifest] = await Promise.all([
      request.get("/robots.txt"),
      request.get("/sitemap.xml"),
      request.get("/manifest.webmanifest"),
    ]);

    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap:");

    expect(sitemap.status()).toBe(200);
    const sitemapXml = await sitemap.text();
    expect(sitemapXml).toContain("<urlset");
    expect(sitemapXml).toContain("<loc>");

    expect(manifest.status()).toBe(200);
    const body = await manifest.json();
    expect(body.name).toBe("GitShipt");
    expect(body.display).toBe("standalone");
  });
});
