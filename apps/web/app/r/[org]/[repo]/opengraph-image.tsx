import { ImageResponse } from "next/og";

import { getProjectPageData } from "@/lib/queries/project-page";

export const runtime = "nodejs";
export const alt = "GitShipt project leaderboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = { org: string; repo: string };

/**
 * Generative OG card for the public project page. Pulls the same data the
 * page renders (project name, token symbol, daily fee total) so a shared
 * link previews with live numbers rather than a static placeholder.
 *
 * Deliberately monochrome with mono numerics so it matches the brand and
 * works on every social platform's preview cropping.
 */
export default async function ProjectOgImage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo).catch(() => null);
  const name = data?.header.name ?? `${org}/${repo}`;
  const language = data?.header.language ?? null;
  const ghOwner = data?.header.ghOwner ?? org;
  const ghRepo = data?.header.ghRepo ?? repo;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(circle at 30% 20%, #1a1a1a 0%, #050505 60%)",
        color: "#f5f5f5",
        fontFamily: "system-ui, sans-serif",
        padding: "60px 72px",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#a3a3a3",
          fontSize: 24,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <div>GitShipt</div>
        <div style={{ fontFamily: "ui-monospace, monospace" }}>
          {ghOwner}/{ghRepo}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            fontSize: 88,
            lineHeight: 1.05,
            fontWeight: 700,
            color: "#fafafa",
            letterSpacing: "-0.025em",
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: "ui-monospace, monospace",
            fontSize: 32,
            color: "#71717a",
          }}
        >
          {language ? (
            <span
              style={{
                background: "#262626",
                padding: "8px 16px",
                borderRadius: 12,
                color: "#fafafa",
              }}
            >
              {language}
            </span>
          ) : null}
          <span>Bags-native fee sharing</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid #262626",
          paddingTop: 28,
          color: "#737373",
          fontSize: 22,
        }}
      >
        <div>Trade fees → top contributors, every 24h</div>
        <div style={{ fontFamily: "ui-monospace, monospace" }}>
          gitshipt.com
        </div>
      </div>
    </div>,
    { ...size },
  );
}
