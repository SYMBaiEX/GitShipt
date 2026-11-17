import { ImageResponse } from "next/og";

import { getContributorProfile } from "@/lib/queries/discovery";
import { formatSol } from "@repo/lib";

export const alt = "GitShipt contributor earnings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = { username: string };

/**
 * Generative OG card for a contributor profile. Renders the username,
 * lifetime SOL earned, and project count. Deliberately mono numerics so
 * the value of the on-chain ledger reads as the headline.
 */
export default async function ContributorOgImage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username } = await params;
  const profile = await getContributorProfile(username).catch(() => null);
  const lifetime = profile
    ? formatSol(profile.totalLifetimeLamports ?? 0n)
    : "—";
  const projects = profile?.projectsCount ?? 0;
  const avatar =
    profile?.avatarUrl ?? `https://github.com/${username}.png?size=200`;

  return new ImageResponse(
    (
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
            @{username}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 36,
          }}
        >
          <img
            src={avatar}
            alt=""
            width={180}
            height={180}
            style={{
              borderRadius: 90,
              border: "2px solid #262626",
            }}
          />
          <div
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div
              style={{
                fontSize: 72,
                lineHeight: 1.05,
                fontWeight: 700,
                color: "#fafafa",
                letterSpacing: "-0.02em",
              }}
            >
              {username}
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 28,
                color: "#71717a",
                display: "flex",
                gap: 24,
              }}
            >
              <span>{lifetime} earned</span>
              <span>{projects} projects</span>
            </div>
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
          <div>On-chain contributor earnings on GitShipt</div>
          <div style={{ fontFamily: "ui-monospace, monospace" }}>
            gitshipt.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
