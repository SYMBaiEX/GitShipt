import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

/**
 * Shared headers — applied to every route.
 * X-Frame-Options varies per source (embed routes need to be iframe-able).
 * CSP is generated in proxy.ts so HTML routes receive one enforced policy.
 * API/static responses still receive the other hardening headers below.
 */
const sharedSecurityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Modern (Reporting API v1) endpoint binding for `report-to` directives.
  // Browsers fall back to `report-uri` when this header is absent.
  {
    key: "Reporting-Endpoints",
    value: 'csp-endpoint="/api/security/csp-report"',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  reactCompiler: true,

  // Cache Components ('use cache' directive). Opts the build into the new
  // cacheLife / cacheTag model. Functions marked 'use cache' run once per
  // (function, args) tuple; their tags participate in revalidateTag. Without
  // this flag the directive is a no-op.
  cacheComponents: true,

  // Named cacheLife profiles consumed by `cacheLife("<name>")`. We name them
  // after the read pattern, not the duration, so call sites read clearly:
  //
  //   - "live"    — home page tickers, stub-mode KPI banners (1 min revalidate)
  //   - "auth"    — session-derived reads that aren't strictly per-user-PII
  //   - "browse"  — public project / leaderboard pages
  //   - "profile" — contributor profile and project metadata
  //   - "admin"   — admin tables (short revalidate, manual invalidation
  //                 dominates)
  //
  // Match CACHE_SECONDS in lib/cache.ts so the migration from
  // unstable_cache(...) -> 'use cache' is a behaviour-preserving swap.
  cacheLife: {
    live: { stale: 30, revalidate: 60, expire: 600 },
    auth: { stale: 30, revalidate: 30, expire: 300 },
    browse: { stale: 60, revalidate: 120, expire: 1800 },
    profile: { stale: 60, revalidate: 300, expire: 3600 },
    admin: { stale: 15, revalidate: 30, expire: 300 },
  },
  devIndicators: { position: "top-right" },
  allowedDevOrigins: ["127.0.0.1"],
  // serverExternalPackages doubles as the workflow step-bundle externals
  // list. Each entry stays out of the static bundle graph and is resolved
  // by Node's require at runtime — required for:
  //
  //   - better-auth: package's exports map fans into kysely/prisma/mongo
  //     adapters that Turbopack would pull into the SSR chunk graph.
  //   - @solana/web3.js: peer deps (@solana/codecs-numbers, rpc-websockets)
  //     that esbuild can't statically resolve in the workflow step bundle
  //     even with a hoisted node_modules layout.
  serverExternalPackages: [
    "better-auth",
    "@solana/web3.js",
    "@solana/codecs-numbers",
    "rpc-websockets",
  ],
  transpilePackages: ["@repo/lib", "@repo/shared", "@repo/ui"],

  images: {
    formats: ["image/webp"],
    qualities: [50, 75],
    minimumCacheTTL: 14_400,
    maximumRedirects: 1,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
    contentDispositionType: "inline",
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "opengraph.githubassets.com" },
      { protocol: "https", hostname: "*.githubusercontent.com" },
      { protocol: "https", hostname: "*.bags.fm" },
      { protocol: "https", hostname: "*.solana.com" },
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "*.ipfscdn.io" },
      { protocol: "https", hostname: "shdw-drive.genesysgo.net" },
      { protocol: "https", hostname: "arweave.net" },
      { protocol: "https", hostname: "*.arweave.net" },
    ],
  },

  async redirects() {
    // Canonical host pin: gitbags.com is a legacy alias kept registered for
    // ownership/SEO. Production lives at gitshipt.com — better-auth's origin
    // check rejects sign-in from any host that isn't `BETTER_AUTH_URL`, so
    // any traffic that lands on gitbags.com gets a 308 to gitshipt.com.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "gitbags.com" }],
        destination: "https://gitshipt.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.gitbags.com" }],
        destination: "https://gitshipt.com/:path*",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      // Default — X-Frame-Options DENY for everything except /embed/*.
      // Negative lookahead in the path matcher excludes /embed paths so the
      // dedicated embed entry below isn't shadowed.
      {
        source: "/:path((?!embed).*)",
        headers: [
          ...sharedSecurityHeaders,
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      // Embed routes — no X-Frame-Options; proxy.ts sets frame-ancestors *.
      {
        source: "/embed/:path*",
        headers: [...sharedSecurityHeaders],
      },
    ];
  },
};

export default withWorkflow(nextConfig);
