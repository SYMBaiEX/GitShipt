import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionChromeProvider } from "@/components/auth/SessionChromeProvider";
import { Toaster } from "@/components/providers/Toaster";
import { Telemetry } from "@/components/providers/Telemetry";
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

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "rgb(8, 8, 12)" },
    { media: "(prefers-color-scheme: light)", color: "rgb(250, 250, 252)" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "GitShipt · GitHub repository token launchpad",
    template: "%s · GitShipt",
  },
  description:
    "Launch a Bags.fm token for an eligible personal GitHub repository with owner rewards.",
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
    title: "GitShipt · GitHub repository token launchpad",
    description:
      "Launch a Bags.fm token for an eligible personal GitHub repository with owner rewards.",
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
        <Suspense fallback={null}>
          <RequestMarker />
        </Suspense>
        <ThemeProvider>
          <Suspense fallback={null}>
            <SessionShell>{children}</SessionShell>
          </Suspense>
          <Toaster />
        </ThemeProvider>
        <Telemetry />
      </body>
    </html>
  );
}

async function RequestMarker() {
  // Session chrome depends on the incoming request, even when its shell streams.
  await connection();
  return null;
}

async function SessionShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return <SessionChromeProvider user={user}>{children}</SessionChromeProvider>;
}
