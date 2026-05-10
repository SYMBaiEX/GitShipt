import type { MetadataRoute } from "next";
import { getAllPublicProjects } from "@/lib/queries/discovery";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://gitshipt.com";

const STATIC_ROUTES = [
  "",
  "/explore",
  "/leaderboard",
  "/launch",
  "/docs",
  "/legal/privacy",
  "/legal/terms",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${appUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "hourly" : "daily",
    priority: route === "" ? 1 : 0.7,
  })) satisfies MetadataRoute.Sitemap;

  const projects = await getAllPublicProjects({
    status: "all",
    sort: "trending",
    search: undefined,
  }).catch(() => []);

  const projectEntries = projects.map((project) => ({
    url: `${appUrl}/r/${project.slug}`,
    lastModified: project.createdAt ?? now,
    changeFrequency: "hourly",
    priority: project.status === "live" ? 0.9 : 0.6,
  })) satisfies MetadataRoute.Sitemap;

  return [...staticEntries, ...projectEntries];
}
