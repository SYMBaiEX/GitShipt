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

# [gitbags] recent context, 2026-06-04 10:05pm CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,598t read) | 505,543t work | 96% savings

### May 12, 2026
S257 Gitbags Mainnet Readiness Gap Analysis — Full audit of what remains before the system can accept real money on Solana mainnet (May 12 at 9:24 PM)
S255 Gitbags Mainnet Security Audit — Implement all suggestions from S253 security review (May 12 at 9:24 PM)
S637 Fix healthpulse and publishkpis Vercel crons from every-minute to weekly Sunday schedule (May 12 at 9:37 PM)
3480 9:48p 🔵 indexer.ts applyBotFlags() Is the Sole Bot Classification Point — GitHub user.type Field Not Captured
3482 " 🔵 buildLaunchClaimerSet — Launch Creates Pool+Treasury 2-Slot Structure, Not Per-Contributor Slots
3485 " 🟣 BOT_REGEX and AUTOMATED_LOGIN_EXACT Massively Expanded — 30+ AI Agents Added
3487 9:49p 🟣 isBot() Hardened — Allowlist Can No Longer Whitelist Known AI Agents; isAiBot() Exported
3488 " 🟣 ContributorAggregate Extended with ghType — GitHub Native Bot Type Now Captured at Ingest
3491 " 🟣 indexer.ts Fully Wired — ghType Propagates Through All 3 Fetchers, mergeAggregates, and applyBotFlags
3493 9:50p 🔴 contributors-upsert.ts — excluded/excludedReason Now Re-Evaluated on Every Index Pass
3494 " 🟣 packages/shared/src/ai-bots.ts Created — Canonical AI Bot List Extracted to Shared Package
3496 " ✅ launch-schemas.ts Imports isAiBot — ScoringConfigSchema botAllowlist Validation Wired
3498 9:51p 🟣 ScoringConfigSchema.botAllowlist Hardened — AI Agents Rejected at Zod Validation Layer
3500 " 🔄 scoring/v0.ts Deduplicates Bot Lists — Now Imports from @repo/shared as Single Source of Truth
3502 " ✅ launch-integration.ts Adds contributors and inArray Imports — Contributor Validation Incoming
3504 " 🟣 assertNoExcludedClaimers() Added to recordLaunch — Belt-and-Suspenders DB Guard Against Bot Claimers
3508 9:56p ⚖️ AI Bot Exclusion — Named Account List Instead of Hard-Deny Pattern Matching
3510 9:57p 🔄 ai-bots.ts — AI_BOT_REGEX + AI_BOT_EXACT Replaced with AI_VENDOR_DENYLIST + isAiVendorAccount
3511 " 🔄 isAiBot → isAiVendorAccount Propagated Across v0.ts and launch-schemas.ts
3514 9:58p 🔄 isAiBot → isAiVendorAccount Propagated to launch-schemas.ts superRefine and revalidateBotFlags-helpers.ts
3516 " ✅ indexer.test.ts — Bot Detection Tests Updated for New Allowlist Semantics
3519 9:59p ✅ AI Vendor Denylist Refactor Committed — commit b82219c
3520 10:09p 🔵 Gitbags Repo State — Clean Except Uncommitted AGENTS.md
3521 " ✅ AGENTS.md Committed and Pushed to origin/main
3522 10:10p 🔵 buildSignAndBroadcastStep — Full Idempotency and Manager Key Validation Logic
3523 " 🔵 productionReadiness() — Full Required Env Surface and Warning Conditions
3528 10:11p 🔵 AI_VENDOR_DENYLIST — Full Exact-Match Set of ~30 Vendor Accounts
3529 " 🔵 revalidateBotFlags Workflow — Weekly Paginated Bot Re-Classification Architecture
3530 " 🔵 contributors-upsert.ts — CASE Logic Preserves Manual Overrides on Conflict
3531 " 🔵 assertNoExcludedClaimers — Launch Guard Against Excluded Contributors
3532 " 🔵 Vercel Cron Schedule — Full 8-Job Inventory in vercel.json
3533 " 🔵 RelativeTime.test.tsx — Known Failing Test Due to Missing @testing-library/react
3541 10:12p 🔵 Security Audit — 5 New Findings from Solana Skills Review of Recent 11 Commits
3580 10:53p 🔵 buildSignAndBroadcastStep — Full On-Chain Transaction Execution Architecture
3581 10:54p 🔴 buildSignAndBroadcastStep — Broadcasting State Recovery Added to Prevent Double-Rebalance
3582 " 🔴 productionReadiness() — HELIUS_WEBHOOK_AUTH_TOKEN and CRON_SECRET Added to Sensitive Attestation Check
3583 " 🔴 assertNoExcludedClaimers — TOCTOU Race Closed, Missing-Contributor Guard Added
3584 10:55p 🟣 revalidateBotFlags — Single-Flight Lock Added via acquireLockStep/releaseLockStep
3585 " 🔵 workflow-locks.ts — Redis-Backed Single-Flight Lock Architecture
3586 " 🔄 revalidateBotFlags-helpers — Lock Steps Added, Audit Refactored Per-Project
3587 " 🟣 AI_VENDOR_DENYLIST — 7 New Vendor Accounts Added
3588 " 🔵 RelativeTime Test Failure Root Cause — vitest env is "node", @testing-library/react Not Installed
3592 10:57p 🔴 RelativeTime Test — happy-dom Installed, Per-File Environment Override Added
3593 " 🔄 solanaConnection — Singleton Bug Fixed, Per-Commitment Cache + withRpcRetry Added
3594 10:59p 🔵 API Rate-Limit Coverage Audit — Routes Without check() Identified
3595 " 🔵 Fund Reconciliation System — Schema and Pure-Function Architecture Mapped
3596 11:00p 🟣 reconcileFunds Workflow — New Fund Reconciliation Vercel Workflow Created
3597 " 🟣 reconcileFunds — Full Workflow Stack Implemented: Steps, Cron Route, and Vercel Schedule
3598 11:01p 🔴 reconcileFunds-helpers — Query Fixed for Actual partnerFeeClaimStatus Enum Values
3599 " ✅ Typecheck Passes — 12 Workflows and 67 Steps in Manifest After All Phase Changes
3600 " ✅ Test Suite Green + Phase 1/2/3 Fixes Committed — 249 Tests Pass, 3 Commits Pushed
3601 11:02p ✅ Phase 1/2/3 — All 7 Commits Pushed to origin/main
### Jun 2, 2026
11975 10:36p ✅ GitHub Actions Workflow Schedules Fixed for healthpulse and publishkpis
### Jun 4, 2026
S702 Production setup checklist — what do we need to configure to go to live production for GitShipt (Next.js 16 + Bags.fm + Solana launchpad-leaderboard)? (Jun 4 at 4:02 PM)
**Investigated**: Examined gitshipt-prd.md, DESIGN.md, vercel.json, apps/web/lib/env.ts, apps/web/app/api/health/route.ts, .env.production.example, .env.production.local, scripts/check-production-env.mjs, docs/adr/0001-bags-native-payout.md, docs/architecture/bags-native/PARTNER-KEY-IMPLEMENTATION.md, apps/web/lib/solana/manager-signer.ts, apps/web/lib/solana/signer.ts, apps/web/lib/redis.ts, apps/web/lib/rate-limit.ts, apps/web/lib/bags/webhook.ts, apps/web/app/api/webhooks/github/route.ts, README.md, and package.json scripts. Ran `bun run env:check -- --env-file=.env.production.local` to get the live state of the production env file.

**Learned**: GitShipt uses a Bags-native payout architecture with three on-chain authority layers: manager role (delegated to GitShipt via SOLANA_MANAGER_KEYPAIR for BPS rebalancing), admin role (held by project owner), and partner role (GitShipt receives 25% of trading fees via BAGS_PARTNER_CONFIG_KEY). The health endpoint at /api/health?strict=1 is the runtime readiness gate — it returns 503 if any integration is stubbed or missing. productionReadiness() in env.ts checks 20 required vars, enforces NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta, and warns if SECRETS_SENSITIVE_ATTESTED is unset. The production env check script (scripts/check-production-env.mjs) validates .env files without printing secret values. BAGS_ALLOW_PROD_LAUNCH is a safety guard that defaults false; mainnet launches proceed when cluster=mainnet-beta. Partner fee claims require SOLANA_PAYOUT_KEYPAIR public key to match BAGS_PARTNER_WALLET exactly. All *_KEYPAIR, *_SECRET, *PRIVATE_KEY must be marked Sensitive in Vercel (post-April 2026 security incident).

**Completed**: Production readiness audit completed. Ran bun run env:check against .env.production.local and confirmed 13 required Sensitive variables are currently empty/missing: BETTER_AUTH_SECRET, GITHUB_CLIENT_SECRET, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_WEBHOOK_SECRET, BAGS_API_KEY, BAGS_WEBHOOK_SECRET, BAGS_PARTNER_CONFIG_KEY, HELIUS_RPC_URL, HELIUS_WEBHOOK_AUTH_TOKEN, SOLANA_PAYOUT_KEYPAIR, SOLANA_MANAGER_KEYPAIR, CRON_SECRET, IDEMPOTENCY_KEY_SECRET. Claude delivered a full 10-step production setup checklist covering Vercel project linking, env var configuration, Neon+Redis provisioning, GitHub OAuth/App wiring, Bags+Solana keypair setup, Helius webhook configuration, DB migrations, admin bootstrap, and the verification gates (env:check → typecheck → lint → test → e2e → build → health?strict=1).

**Next Steps**: User would need to provision the missing secrets and configure external services (GitHub OAuth App, GitHub App webhooks, Bags partner config, Helius mainnet RPC + webhook, Neon prod database, Redis/Upstash, Vercel env vars). After populating .env.production.local, re-run bun run env:check to confirm all pass, then run the full quality gate suite before deploying.


Access 506k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
