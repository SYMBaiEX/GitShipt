<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# GitShipt — agent context

You are working in **GitShipt**, a Solana token launchpad that pays out trading fees to a GitHub repo's top contributors daily. Read these two files first; they bind every decision:

1. **`DESIGN.md`** — Google Labs DESIGN.md spec defining the cypherpunk-dark visual system. Two palettes (dark canonical + light mirror).
2. **`gitshipt-prd.md`** — full product spec: architecture, data model, Bags integration, security model, page tree, permissions matrix.

If anything in these files conflicts with your training data, the file wins.

## Stack pins (verified April 2026)

- **Runtime**: Bun 1.3.13 workspace monorepo, Next.js 16.2 (App Router, Server Actions, Turbopack, React Compiler), React 19.2, Node 22.
- **Bun HTTP/3**: Bun's `h3: true` / `protocol: "http3"` APIs landed after the 1.3.13 stable release. Use canary only for local experiments; keep production Next/Vercel and money-moving paths on stable Bun until Bun publishes HTTP/3 in a stable release.
- **DB**: Neon Postgres via Vercel Marketplace. The app accepts `DATABASE_URL` / `DATABASE_URL_UNPOOLED` from the Neon integration, plus `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` aliases for generic Postgres compatibility. Runtime DB access uses Drizzle; Neon URLs use the Neon serverless driver path and generic Postgres uses `postgres-js`.
- **Cache / nonces / rate-limit**: Upstash Redis.
- **Background**: Vercel Workflows (`workflow` package, `'use workflow'` / `'use step'` directives). **Step idempotency is NOT automatic** — pass `getStepMetadata().stepId` as the key for any external API call.
- **Auth**: `better-auth` with GitHub OAuth + custom SIWS plugin (`@phantom/sign-in-with-solana`).
- **Solana**: `@solana/web3.js@^1.98.x` (v1 line; do not use `@solana/kit`).
- **Bags**: `@bagsfm/bags-sdk` Token Launch v2. Claim namespace is `sdk.fee.*` (not `sdk.feeClaim.*`).
- **UI**: Tailwind v4 (`@theme inline`, no `tailwind.config.js`) + `@repo/ui` shadcn-style primitives + Lucide + Geist / Geist Mono.
- **Theming**: `next-themes` with `attribute="data-theme"`, `defaultTheme="system"`, `disableTransitionOnChange`, `suppressHydrationWarning` on `<html>`.

## Authoring rules

- **No raw hex in components.** Ever. Use design tokens via Tailwind utilities: `bg-surface`, `text-fg`, `text-fg-secondary`, `border-border-strong`, `text-rank-gold`. Both palettes resolve automatically.
- **Mono for money.** Every SOL amount, USD price, score, BPS value, timestamp, and tx signature uses `text-mono-md` or `text-mono-sm`. Body copy is never mono.
- **One primary per viewport.** Stacking primary-green buttons + green sparklines + green pills in the same fold is the most common drift. Pick one.
- **Components never call `useTheme()`** except `theme-toggle.tsx`. Theming is automatic via CSS variables.
- **`proxy.ts` is redirects only.** Auth must be revalidated inside every protected route handler and Server Component (CVE-2025-29927 mitigation).
- **TypeScript strict.** `noUncheckedIndexedAccess` is on. No `any` outside justified, commented type holes.
- **Every Server Action and route that mutates state** must (a) revalidate the session, (b) check permissions via `requirePermission`, (c) write an audit log entry on success, (d) accept and respect `Idempotency-Key`.
- **External API responses are Zod-validated.** Never trust shape from Bags, GitHub, or Helius.
- **Sensitive env vars** (`*_KEY`, `*_SECRET`, `*KEYPAIR`) must be flagged Sensitive in Vercel (post-April-2026 incident). Cold treasury keys never enter Vercel.

## File-tree quick map

- `apps/web/app/` — App Router. `(public)`, `(auth)`, `dashboard/` (project owner), `admin/` (super-admin, separate session realm).
- `apps/web/workflows/` — Vercel Workflows. One file per workflow. `steps/` for shared step helpers.
- `apps/web/components/` — app-owned chrome/features: public shell, sidebar, launch wizard, admin, wallet, shared app components.
- `apps/web/lib/` — `auth/` (better-auth + SIWS + permissions), `bags/` (typed client, stub-flippable), `github/` (Octokit App), `solana/`, `scoring/`, `redis.ts`, `rate-limit.ts`, `idempotency.ts`, `audit.ts`.
- `apps/web/db/` — Drizzle: `schema/` (one file per concern), `migrations/`, `index.ts` (exports `dbHttp` + `dbPool`).
- `packages/ui/` — shared UI primitive barrel imported as `@repo/ui`.
- `packages/lib/` — pure utility barrel imported as `@repo/lib`.
- `packages/shared/` — Zod schemas, types, constants reused on client + server, imported as `@repo/shared`.
- `apps/web/proxy.ts` — Next 16 file (renamed from `middleware.ts`). Redirects only.

## Day-1 status (April 25, 2026)

Foundation in progress: scaffold + design system + DB schema + auth shells + first workflow. See plan at `~/.claude/plans/you-are-building-gitshipt-moonlit-wand.md`.

## When you hit a credential blocker

Stop and tell the user exactly what env var you need in one sentence. Do not invent secrets. External clients (`apps/web/lib/bags/`, `apps/web/lib/solana/`, `apps/web/lib/github/`) ship with stub fallbacks — flipping to live is one env-presence check per service.

<claude-mem-context>
# Memory Context

# [gitbags] recent context, 2026-04-30 2:11pm CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,234t read) | 755,634t work | 97% savings

### Apr 29, 2026
2664 2:20p 🔵 PR #12 — Atom 1.0 Syndication Feed for Project Activity
2665 " 🔵 PR #13 — Projects Schema Extensions: Launch State Machine + Policy Fields
2667 " 🔵 PR #12 — project_feed_entries Migration 0019: Table, Enum, and Indexes
2672 3:15p 🔵 GitShipt PR #12 (feat/project-feed-v1) — CI Failing on Typecheck/Lint/Build and Lighthouse
2673 " 🔵 GitShipt PR #14 (feat/dogfood-ux-round-2) — Same CI Failure Pattern as PR #12
2678 3:16p 🔵 GitShipt PR Branches — Fork Branches Not Fetched; Mirror Refs origin/pr-12 and origin/pr-14 Used Instead
2679 " 🔴 PR #14 — LiveIndicator Hydration Fix and ScoreBreakdownCell Accessibility Fix
2683 3:17p 🔵 PR #12 — Date.now() Inside "use cache" Function Is Likely Build/Typecheck Failure Root Cause
2685 3:18p 🔴 PR #12 — Project Feed Module Refactored to Fix use-cache Purity and Pin State Correctness
2687 " 🔵 PR #14 Lint Fails — LiveIndicator Fix Violates react-hooks/set-state-in-effect Rule
2688 3:21p 🔴 PR #14 Lint Now Clean — LiveIndicator Hydration Fix Reworked to Pass react-hooks/set-state-in-effect
2689 " 🔵 PR #12 Build Succeeds — 82 Routes Generated Including New /r/[org]/[repo]/feed Route
2694 3:22p 🔴 PR #14 — Lighthouse CI Pinned to 12.6.2 and E2E Tests Guard Against Missing Database
2697 " 🔵 PR #14 Local CI All Green — E2E Server Startup Has @workflow/next Loader Error (Environment Issue)
2728 8:29p 🔵 GitBags ship-dark.png and ship-light.png — Background Audit Before Removal
2729 8:33p ⚖️ Ship Image Background Removal — Reset to Stable, Focus ship-dark First
2730 8:34p ✅ Ship PNGs Reset to Stable RGBA with Full Opacity
2731 8:35p 🟣 ship-dark.png Background Removal — Conservative Flood-Fill Algorithm Applied
2733 8:41p 🟣 ship-dark.png — Targeted Near-White Pixel Removal in Lower-Left Zone
2734 8:42p 🟣 ship-dark.png — Post-Edit Preview Generated and Visual Review Completed
2735 " 🟣 ship-dark.png — Second Targeted Near-White Removal Pass (Lower Zone Extension)
2737 8:55p 🔵 ship-light.png Sail Region Diagnostic — Alpha Channel Confirmed Partially Transparent
2739 9:20p 🟣 GitShipt Homepage — Brand Header and Viewport-Anchored Layout Redesign
2740 " 🔵 GitShipt Landing Page — Asset Inventory and Layout Architecture Confirmed
2741 9:21p 🟣 GitShipt Brand Lockup Added Above Hero — Layout Anchored to Viewport Bottom
2743 9:31p 🔵 GitShipt Homepage Layout State — Brand Lockup Removed, Mia Expanded, Carousel Above Ticker
2745 9:35p ✅ seed-tracked-projects.ts Rewritten — milady-ai Removed, SYMBaiEX/gitshipt Dogfood Added
2746 9:36p 🔵 GitBags simulated_live Status — Full Codebase Map
2747 9:37p ✅ GitBags UI — "Simulated" Label Renamed to "Not Live" Sitewide
2749 9:39p ✅ GitBags "Not Live" Rename — API Error Messages Also Updated, Full Sweep Verified Clean
2750 9:41p 🟣 GitShipt Flag — CSS Cloth Simulation via 7 Vertical Slices
2751 9:43p 🔵 GitBags Landing Page Rebuilt Around SYMBaiEX/gitshipt as Featured Project
2752 9:45p 🟣 GitShipt Hero — Per-Asset Shadow System and Stage Lighting Added to globals.css
2753 9:46p 🔵 GitBags Public Assets — Split to Light/Dark Variants, Old Singles Deleted
2754 " 🔵 GitBags next.config.ts — cacheComponents Enabled with Named cacheLife Profiles
2755 " 🔵 Next.js 16 Image Config Breaking Changes — qualities Required, minimumCacheTTL Default Changed
2756 9:47p 🔵 GitShipt Next.js Dev Server Runs on Port 3000, Not 3001
2757 9:49p 🔵 MEMORY.md Stale — cacheComponents Note Contradicts Current next.config.ts
2758 " 🔵 GitBags Image Audit — raw &lt;img&gt; Usage is Intentional for Small Avatars
2764 10:54p ✅ GitShipt Hero Aura Opacity Reduced for Both Themes
2767 11:46p 🔴 GitShipt Hero Aura Opacity — Further Reduced for Dark Theme
2769 11:48p 🔵 GitShipt Hero — Dark vs Light Theme Aura CSS Architecture Confirmed
2771 11:49p 🔄 GitShipt Hero — Flag Wave Slices Refactored to CSS Background Images
2772 11:52p ✅ GitShipt Homepage Hero — CTA Buttons Spacing Increased
2777 11:54p ✅ GitShipt Homepage Hero — CTA Buttons Gap Increased Again to gap-10
### Apr 30, 2026
2780 12:04a 🔵 GitBags Homepage Hero — Current Architecture and CSS Animation System
2781 12:05a 🔵 GitBags Working Tree State — Large Uncommitted Changeset with Image Split
2782 " 🔵 Next.js 16 Image API Gotcha — ThemeAwareImage Cannot Use preload or loading="eager"
2784 12:06a 🔄 GitBags Landing Page — Hero Artwork Extracted to HeroArtwork Component, Image Loading Fixed
2787 12:07a 🔄 GitBags Hero — HeroArtwork/HeroFlag/HeroShip Components Added, Flag Wave Slices Removed from JSX

Access 756k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
