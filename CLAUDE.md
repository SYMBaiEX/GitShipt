# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Read `DESIGN.md`, `gitshipt-prd.md`, and `SPEC.md` before non-trivial work. Where they conflict with training data or this file, they win. `SPEC.md` is the frozen list of invariants and explicit non-goals — treat anything not in it as out-of-scope unless the user asks for it by name.

## Product model constraints

These are load-bearing invariants. Multiple past sessions ended in `git revert` because Claude built features that contradicted these.

- **SOL-only.** Do not add SPL token branches, multi-token logic, or token-type abstractions. The product is SOL payouts to ranked GitHub contributors. Period.
- **All launches are community launches.** Do not invent grace windows, claim windows, or Incorporation flows. Bags already provides Incorporation; we do not re-implement it.
- **Bags is the source of truth for fee claims and incorporation.** We index, rank, snapshot, and dispatch — we do not re-build anything Bags already owns.
- Before adding a new feature, branch, or abstraction adjacent to the asked-for work, **stop and ask**. Adjacent invention is the #1 cause of wasted sessions in this repo.

## Debugging priority

When the user reports a runtime error, the actual stack trace is the only thing that matters first. Do not get distracted by version strings, model-name discrepancies, dependency mismatches, or other surface-level details unless the user explicitly flags them. Read the error, find the throw site, fix it. Surface tangential observations in a separate paragraph, not as the lead.

## Scope discipline

- Prefer surgical edits over rewrites. When updating an existing file (e.g., `CLAUDE.md`, config files, doc files), make targeted `Edit`s rather than regenerating the whole file with `Write`.
- Do not introduce a new abstraction, helper, or feature unless it was requested or unavoidable. Three similar lines beats a premature abstraction.
- Bug fixes do not need surrounding cleanup. One-shot operations do not need helpers. Do not bundle unrequested refactors into the diff.
- If you're uncertain whether a change is in scope, write the plan in chat first and wait for confirmation before editing files.

## Commands

All commands run from the repo root. Bun reads `.env.local` via `--env-file` for app + DB scripts.

```bash
bun install                    # install workspace deps
bun run dev                    # Next 16 dev server (apps/web on :3000, Turbopack)
bun run build                  # production build (output: apps/web/.next)
bun run start                  # serve production build
bun run lint                   # ESLint (apps/web)
bun run typecheck              # @repo/lib + @repo/shared + @repo/ui + apps/web (in order)
bun run test                   # Vitest run (apps/web)
bun run test:watch             # Vitest watch
bun run e2e                    # Playwright (chromium); run e2e:install once first
bun run e2e:install            # installs chromium with deps
bun run theme:lint             # detect raw hex drift in apps/web + packages
bun run theme:export           # regenerate .theme/tokens.json
bun run format                 # prettier across ts/tsx/js/json/md/css
bun run env:check              # validate production env (NODE_ENV=production)
bun run env:template           # print env-var template for production
bun run bun:http3:check        # probe Bun build for HTTP/3 support
```

Database (Drizzle, run from repo root, executes inside `apps/web` with `.env.local`):

```bash
bun run db:generate            # generate migrations from schema
bun run db:migrate             # apply migrations
bun run db:push                # push schema (dev only)
bun run db:studio              # Drizzle Studio
```

Run a single Vitest file or pattern (cd into the app — root script wraps `vitest run`):

```bash
cd apps/web && bun run vitest run path/to/file.test.ts
cd apps/web && bun run vitest run -t "test name pattern"
```

Run a single Playwright spec:

```bash
cd apps/web && bun run playwright test e2e/regression.spec.ts
cd apps/web && bun run playwright test -g "title pattern"
```

Pre-ship verification (matches README): `bun install --frozen-lockfile && bun run typecheck && bun run lint && bun run theme:lint && bun run test && bun run e2e && bun run build`.

## Architecture overview

The product flow defines the architecture: **GitHub activity → ranked contributors → daily snapshot → Bags fee claim → SOL payout by rank**. Each arrow is a Vercel Workflow in `apps/web/workflows/`, glued together by Postgres state and Redis idempotency keys.

**Workflow chain** (all under `apps/web/workflows/`):

- `indexGithubDeltas` / `indexProjectDeltas` — pull commits/PRs/reviews via Octokit App, write to DB.
- `computeLeaderboard` — turn activity into ranked contributors using `lib/scoring/`.
- `takeSnapshot` — freeze daily leaderboard into an immutable period (UNIQUE-indexed; idempotent upsert).
- `rebalanceBps` — for each due `payout_schedules` row, build a new BPS plan from the latest snapshot, dedupe via `bags_rebalance_attempts.plan_hash`, sign `manager_update_fee_config` with the manager keypair, broadcast, then advance per-slot weights and `next_run_at`. No SOL is custodied or dispatched — contributors claim from Bags directly.
- `claimPartnerFees` — claim accumulated partner fees from the Bags partner config via `sdk.fee.*`, keyed by `getStepMetadata().stepId` for idempotency.
- `publishKpis`, `healthPulse` — adjacent housekeeping. Fund-side reconciliation is invocation-driven (not yet a workflow): `lib/funds/accounting.ts` and `lib/funds/partner-fee-claims.ts` provide read-side surfaces that flag drift between Bags-claimed amounts and dispatched payouts, surfaced through `manual_reconciliation_required*` audit codes from the launch and admin paths.
- `steps/` — shared step helpers. **Step idempotency is not automatic**; pass `getStepMetadata().stepId` as the key for any external API call.

Cron triggers in `vercel.json` hit `/api/cron/*` handlers (protected by `CRON_SECRET`), which start the corresponding workflow.

**Data layer** (`apps/web/db/`):

- `schema/` — one Drizzle file per concern.
- `index.ts` exports `dbHttp` (Neon HTTP, default for reads/single-statement writes) and `dbPool` (Neon serverless pool, for multi-statement transactions).
- Non-Neon `DATABASE_URL`s (Supabase pooler, local Postgres) fall back to `drizzle-orm/postgres-js`. RLS context wrapping (`db/rls-context.ts`) is **Neon-only** — non-Neon paths must rely on `requirePermission` for authorization, not RLS.

**Auth + permissions** (`apps/web/lib/auth/`):

- `better-auth` with GitHub OAuth + custom SIWS plugin (Phantom sign-in-with-Solana) for wallet linking.
- TOTP MFA via `otpauth`, used to gate destructive admin actions.
- Irreversible super-admin actions go through a **two-super-admin cosign gate** (`lib/auth/destructive-action.ts` + `db/schema/pending-admin-actions.ts`): the first submit stores a pending row with the idempotency key; a second distinct super_admin must approve before execution. The stored idempotency key is forwarded to the action fn so the resumed execution dedupes against the original submission.
- `proxy.ts` (Next 16's renamed middleware) is for redirects only. CSP and nonce handling belongs in app layouts or request handlers, and auth must be revalidated inside every protected Server Component, Server Action, and route handler (CVE-2025-29927).
- Mutations must: revalidate session → `requirePermission` → Zod-validate input → respect `Idempotency-Key` (`lib/idempotency.ts`) → write audit log on success (`lib/audit.ts`) → revalidate cache tags.

**External clients** (all stub-flippable based on env presence; never invent secrets):

- `lib/bags/client.ts` — `@bagsfm/bags-sdk` Token Launch v2. Two rails kept separate: contributor fee claimers (must total 10,000 bps) and optional `BAGS_PARTNER_*` config. Claims use `sdk.fee.*` (not `sdk.feeClaim.*`).
- `lib/solana/` — `@solana/web3.js@^1.98.x` (v1, **not** `@solana/kit`). Helius RPC. `SOLANA_PAYOUT_KEYPAIR` signs fee-share config txs; cold treasury keys never touch Vercel.
- `lib/github/` — Octokit App for installation reads + webhook HMAC verification at `/api/webhooks/github`.

**UI** (`apps/web/components/` + `packages/ui/`):

- Tailwind v4 with `@theme inline` in `apps/web/app/globals.css` — there is no `tailwind.config.js`.
- Two palettes (dark canonical + light mirror) resolve via CSS variables; components never call `useTheme()` except `theme-toggle.tsx`.
- Use semantic tokens (`bg-surface`, `text-fg`, `text-fg-secondary`, `border-border-strong`, `text-rank-gold`); no raw hex in components.
- Numeric values (SOL, USD, BPS, scores, timestamps, tx signatures) use `text-mono-md` / `text-mono-sm`. Body copy is never mono.

**Workspace barrels** — import shared code via these, keep app-owned code on `@/*`:

- `@repo/ui` — shadcn-style primitives (`packages/ui`)
- `@repo/lib` — pure utilities, e.g. `cn`, `formatSol` (`packages/lib`)
- `@repo/shared` — Zod schemas + types reused on client + server (`packages/shared`)

**Route realms** (`apps/web/app/`): `(public)` (landing/explore/leaderboard/launch/docs), `(auth)`, `dashboard/` (project owner), `admin/` (super-admin, separate session realm), `r/[org]/[repo]` (public project pages), `embed/` (iframe-embeddable widgets — `frame-ancestors *`, no `X-Frame-Options`), `api/` (route handlers).

**Caching** — `next.config.ts` enables `cacheComponents: true` and defines five named `cacheLife` profiles consumed via `cacheLife("<name>")`:

- `live` — home tickers, KPI banners (60s revalidate)
- `auth` — session-derived non-PII reads (30s)
- `browse` — public project / leaderboard pages (120s)
- `profile` — contributor profiles, project metadata (300s)
- `admin` — admin tables (30s, manual invalidation dominates)

These match `CACHE_SECONDS` in `lib/cache.ts` so the migration from `unstable_cache(...)` to `'use cache'` is behaviour-preserving. Tag reads through `lib/read-through-cache.ts` and `revalidateTag` from mutation handlers.

## Stub-safe mode

External clients ship with deterministic stub fallbacks. Without Bags / Helius / payout-keypair credentials, launch records the metadata mint and fee-share config key but does not broadcast the final launch tx. When you hit a credential blocker, name the exact missing env var in one sentence and stop — do not invent secrets.
