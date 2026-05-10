import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionChromeProvider } from "@/components/auth/SessionChromeProvider";
import { Toaster } from "@/components/providers/Toaster";
import { SkipLink } from "@/components/shared/SkipLink";
import { getSessionUser } from "@/lib/auth/session";
import "./globals.css";

// Reading the per-request CSP nonce via headers() opts the layout into
// dynamic rendering. With Next 16 cacheComponents enabled, route-segment
// `dynamic = "force-dynamic"` is forbidden — caching is opt-in per function
// via the `'use cache'` directive. Layouts that read headers() are
// inherently dynamic, and the cache decision lives inside the data-fetch
// helpers in lib/queries/* where each function picks a `cacheLife` profile
// and emits its tags. Public pages still get edge cache via the cached
// query's revalidate window; the surrounding layout shell renders fresh
// per request so the nonce is always per-response.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "GitShipt — tokenize your repo, pay your contributors",
    template: "%s · GitShipt",
  },
  description:
    "GitShipt turns any GitHub repo into a tradeable Bags.fm token. Swap fees flow to top contributors through Bags-native fee sharing.",
  applicationName: "GitShipt",
  authors: [{ name: "SYMBiEX" }],
  keywords: [
    "Solana",
    "Bags.fm",
    "GitHub",
    "open source",
    "token launch",
    "leaderboard",
    "contributor payouts",
  ],
  openGraph: {
    type: "website",
    siteName: "GitShipt",
    title: "GitShipt — tokenize your repo, pay your contributors",
    description:
      "GitShipt turns any GitHub repo into a tradeable Bags.fm token. Swap fees flow to top contributors through Bags-native fee sharing.",
    images: [{ url: "/content.png", width: 1600, height: 900 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/content.png"],
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  robots: { index: true, follow: true },
};

/**
 * Root layout is sync so the static <html>/<body> shell can prerender
 * under Cache Components. The dynamic chrome (session, providers) is
 * deferred behind a Suspense boundary so cached pages still cache.
 *
 * CSP: we previously minted a per-request nonce + 'strict-dynamic' here,
 * but that was incompatible with Vercel's edge cache — the cached HTML
 * served stale nonces while the proxy stamped fresh nonces in the response
 * CSP, mismatching every script. CSP now uses 'self' + 'unsafe-inline'
 * for script-src (the standard Next/Vercel default). Nonce hardening can
 * return once we adopt build-time hash-based CSP.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen bg-app-gradient text-fg antialiased">
        <SkipLink />
        <ThemeProvider>
          <Suspense fallback={null}>
            <SessionShell>{children}</SessionShell>
          </Suspense>
          <Toaster />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

async function SessionShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return <SessionChromeProvider user={user}>{children}</SessionChromeProvider>;
}
