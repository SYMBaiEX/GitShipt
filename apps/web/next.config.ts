import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

/**
 * Shared headers — applied to every route.
 * CSP and X-Frame-Options vary per source (embed routes need to be iframe-able).
 * CSP is generated in proxy.ts so Next.js can attach per-request nonces during
 * SSR. Keeping it out of next.config avoids a second static policy that would
 * conflict with the nonce policy.
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

/**
 * Content-Security-Policy — static fallback.
 *
 * Per-request nonce CSP is set by `proxy.ts` for every HTML route it matches
 * (everything except /api/*, /_next/static, /_next/image, and static assets).
 * The proxy mints a fresh nonce, sets `x-nonce` so layouts can pass it to
 * inline-script consumers (next-themes, etc.), and emits a CSP that drops
 * `'unsafe-inline'` from script-src in favour of `'strict-dynamic'` + nonce.
 *
 * The headers below are the floor for routes the proxy does NOT touch:
 * static assets, API responses, image-optimisation responses. Those don't
 * have inline scripts so `'unsafe-inline'` here is a non-issue. Keeping a
 * defined CSP on every response is required by OWASP ASVS V14.4.
 */
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://va.vercel-scripts.com",
  "https://vitals.vercel-insights.com",
  ...(isDev ? ["'unsafe-eval'"] : []),
].join(" ");
const reportOnlyScriptSrc = [
  "'self'",
  "https://va.vercel-scripts.com",
  "https://vitals.vercel-insights.com",
  ...(isDev ? ["'unsafe-eval'"] : []),
].join(" ");
const connectSrc = [
  "'self'",
  "https://api.github.com",
  "https://github.com",
  "https://*.bags.fm",
  "https://public-api-v2.bags.fm",
  "https://api.devnet.solana.com",
  "https://api.testnet.solana.com",
  "https://api.mainnet-beta.solana.com",
  "https://*.helius-rpc.com",
  "https://*.helius.xyz",
  "https://*.upstash.io",
  "https://*.redislabs.com",
  "https://*.supabase.co",
  "https://*.neon.tech",
  "https://*.vercel.app",
  "https://vitals.vercel-insights.com",
  "https://va.vercel-scripts.com",
  "wss:",
].join(" ");

const cspStrict = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://github.com https://*.githubusercontent.com https://avatars.githubusercontent.com https://opengraph.githubassets.com https://*.bags.fm https://*.solana.com https://arweave.net https://*.arweave.net https://ipfs.io https://*.ipfscdn.io https://shdw-drive.genesysgo.net",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/security/csp-report",
  "report-to csp-endpoint",
].join("; ");

const cspReportOnly = [
  "default-src 'self'",
  `script-src ${reportOnlyScriptSrc}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://github.com https://*.githubusercontent.com https://avatars.githubusercontent.com https://opengraph.githubassets.com https://*.bags.fm https://*.solana.com https://arweave.net https://*.arweave.net https://ipfs.io https://*.ipfscdn.io https://shdw-drive.genesysgo.net",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/security/csp-report",
  "report-to csp-endpoint",
].join("; ");

const cspReportOnlyEmbed = cspReportOnly.replace(
  "frame-ancestors 'none'",
  "frame-ancestors *",
);

const reportOnlyHeader = isDev
  ? []
  : [{ key: "Content-Security-Policy-Report-Only", value: cspReportOnly }];

const reportOnlyEmbedHeader = isDev
  ? []
  : [
      {
        key: "Content-Security-Policy-Report-Only",
        value: cspReportOnlyEmbed,
      },
    ];

/**
 * Embed CSP — same as strict but allows the page to be framed anywhere.
 * frame-ancestors * is required so third-party sites can embed
 * /embed/r/{org}/{repo} via <iframe>.
 */
const cspEmbed = cspStrict
  .replace("frame-ancestors 'none'", "frame-ancestors *")
  .concat("");

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
    live:    { stale: 30,  revalidate: 60,   expire: 600 },
    auth:    { stale: 30,  revalidate: 30,   expire: 300 },
    browse:  { stale: 60,  revalidate: 120,  expire: 1800 },
    profile: { stale: 60,  revalidate: 300,  expire: 3600 },
    admin:   { stale: 15,  revalidate: 30,   expire: 300 },
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
