# GitShipt

Launch a Bags.fm token for any GitHub repository and route trading fees back to
the people who built it. GitShipt keeps the token launch simple, computes a daily
contributor leaderboard from GitHub activity, claims accrued Bags fees into a
platform pool, and pays contributors by rank.

Built for the Bags.fm Hackathon, submission target April 28, 2026.

## Source Of Truth

These root files bind product and implementation decisions:

- [`DESIGN.md`](./DESIGN.md) defines the cypherpunk-dark visual system, dual
  palettes, typography, component rules, and no-raw-hex discipline.
- [`gitshipt-prd.md`](./gitshipt-prd.md) defines product scope, data model,
  permissions, launch flow, payout workflow, and security posture.
- [`AGENTS.md`](./AGENTS.md) summarizes the repo-specific constraints for
  coding agents and maintainers.

If this README disagrees with those files, the spec wins.

## Stack

- Bun 1.3.13 workspace monorepo with `bun.lock`
- Next.js 16.2 App Router, React 19.2, React Compiler, Turbopack, Node 22
- TypeScript strict with `noUncheckedIndexedAccess`
- Tailwind v4 with `@theme inline`, shadcn-style primitives in `@repo/ui`,
  Lucide, Geist, Geist Mono
- `better-auth` with GitHub OAuth plus custom SIWS wallet linking
- Neon Postgres through Drizzle, using `DATABASE_URL` for runtime queries and
  `DATABASE_URL_UNPOOLED` for migrations and multi-statement workflow
  transactions
- Redis for rate limits, idempotency, nonce storage, MFA confirmation, and cache
  coordination
- Vercel Workflows for indexing, snapshots, Bags BPS rebalances, partner fee
  claims, and KPI
  publishing
- `@bagsfm/bags-sdk` v1.3.x, `@solana/web3.js` v1.98.x, Helius RPC

## Repo Structure

```txt
apps/
  web/                  Next.js app, route handlers, server actions, DB, auth,
                        Bags clients, workflows, and app-owned components
packages/
  lib/                  Pure utilities: formatting, cn(), IDs, language colors
  shared/               Zod schemas, constants, and shared API types
  ui/                   shadcn-style UI primitives and sidebar primitives
scripts/                Root dev/CI helper scripts
```

The split is intentionally small. Server auth, DB, external clients, and
workflows remain inside `apps/web` because they currently share environment,
database, and Next/Vercel runtime boundaries. Shared packages are only used for
surfaces that have clean dependency direction and real reuse.

## Local Development

```bash
bun install
cp .env.example .env.local
bun run db:generate
bun run db:migrate
bun run dev
```

Open <http://localhost:3000>.

Missing external credentials keep the app in stub-safe mode where possible.
Do not invent secrets. If live behavior is needed, add the required environment
variable explicitly.

Playwright e2e defaults to a production-mode server on port 3100, so it can run
while a separate `bun run dev` session is active. Set `E2E_PORT=3101` to move
that server, or set `E2E_BASE_URL=http://localhost:3000` /
`PLAYWRIGHT_BASE_URL=http://localhost:3000` to reuse an existing app server.

## Workspaces

- `@repo/web` is the deployable Next.js app in [`apps/web`](./apps/web).
- `@repo/ui` exports UI primitives from [`packages/ui`](./packages/ui).
- `@repo/lib` exports pure utility functions from [`packages/lib`](./packages/lib).
- `@repo/shared` exports cross-boundary schemas and types from
  [`packages/shared`](./packages/shared).

Use package barrels for shared imports:

```ts
import { Button } from "@repo/ui";
import { cn, formatSol } from "@repo/lib";
import { CreateProjectBodySchema } from "@repo/shared";
```

Keep app-owned code on the `@/*` alias inside `apps/web`.

## Environment

Core variables:

- Use [`.env.production.example`](./.env.production.example) as the production
  input template.
- Run `bun run env:template` to print the variable list with Sensitive/Plain
  classification.
- Run `bun run env:check -- --env-file=.env.production.local` before launch to
  validate a local production env file without printing secret values.
- Vercel does not reveal Sensitive values through `vercel env pull`; use
  `GET /api/health?strict=1` on the deployed URL as the runtime readiness gate.
- `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` should point at the deployed app
  origin. Production uses `https://gitshipt.com`.
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are the preferred server-only Neon
  Postgres connection URLs. `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING` remain
  accepted aliases for generic Postgres compatibility.
- Never use `NEXT_PUBLIC_DATABASE_URL` or `NEXT_PUBLIC_DATABASE_URL_*`; any
  `NEXT_PUBLIC_*` value is exposed to browser code.
- `REDIS_URL` or Vercel Upstash's `UPSTASH_REDIS_REST_REDIS_URL` must be a
  Redis-compatible URL; production needs this for rate limits, idempotency,
  SIWS nonces, and workflow safety.
- `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` enable
  GitHub sign-in. The production GitHub OAuth callback is
  `https://gitshipt.com/api/auth/callback/github`.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, and
  `GITHUB_APP_SLUG` enable repo installation, webhooks, and private App reads.
  The production GitHub App webhook URL is
  `https://gitshipt.com/api/webhooks/github`.
- `BAGS_API_KEY` enables live Bags SDK calls.
- `BAGS_PARTNER_WALLET`, `BAGS_PARTNER_CONFIG_KEY`, and `BAGS_CONFIG_TYPE` are
  optional Bags partner/config controls.
- `HELIUS_RPC_URL`, `SOLANA_MANAGER_KEYPAIR`, and the legacy
  `SOLANA_PAYOUT_KEYPAIR` gate are required before live Bags fee-share config
  transactions can be signed.
- `SOLANA_TREASURY_ADDRESS` receives the GitShipt platform fee share.
- `CRON_SECRET` protects cron/admin automation endpoints.

Every `*_KEY`, `*_SECRET`, `*PRIVATE_KEY`, and `*KEYPAIR` value must be marked
Sensitive in Vercel. Cold treasury private keys must never enter Vercel.

Production readiness checks require the deployed environment to use the live
cluster and canonical origin:

- `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`.
- `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` set to `https://gitshipt.com`, not
  localhost or a preview URL.
- `BAGS_PARTNER_WALLET` and `BAGS_PARTNER_CONFIG_KEY` configured as a matching
  Bags partner pair. Keep the real config key out of the repo and set it only
  in the deployment environment, marked Sensitive under the repo policy above.
- `GITHUB_APP_SLUG` set to the short GitHub App URL slug, not the full app URL.

## Route Map

Public app:

- `/` landing and live protocol overview
- `/explore` project discovery
- `/leaderboard` global contributors
- `/launch` launch wizard
- `/docs` product docs
- `/r/[org]/[repo]` public project page plus docs, payouts, repository,
  snapshots, and token subpages
- `/u/[username]` contributor profile
- `/legal/privacy` and `/legal/terms`

Authenticated account:

- `/dashboard` account overview
- `/dashboard/projects` owned projects
- `/dashboard/earnings` contributor earnings
- `/dashboard/wallets` SIWS wallet links
- `/dashboard/security` MFA controls
- `/dashboard/api-keys` account-level API key landing page
- `/dashboard/projects/[id]` project console with leaderboard, scoring, payouts,
  snapshots, token, repository, API keys, settings, and team controls

Admin:

- `/admin` platform overview
- `/admin/projects`, `/admin/projects/[id]`, `/admin/projects/launch`
- `/admin/payouts`, `/admin/snapshots`, `/admin/workflows`
- `/admin/users`, `/admin/audit`, `/admin/treasury`
- `/admin/fees`, `/admin/integrations`, `/admin/db`
- `/admin/abuse`, `/admin/feature-flags`, `/admin/maintenance`, `/admin/settings`

`apps/web/proxy.ts` is redirects only. Protected Server Components, Server
Actions, and route handlers revalidate the session and permissions in-process.

## API Structure

Stable public/project API:

- `POST /api/projects` creates a draft project.
- `POST /api/projects/[id]/launch` runs metadata upload and fee-share config.
- `GET /api/projects/[id]` returns project data.
- `POST /api/projects/[id]/reindex` starts contributor reindexing.
- `POST /api/projects/[id]/transfer` transfers ownership.
- `GET|POST /api/projects/[id]/api-keys` lists and creates project keys.
- `DELETE /api/projects/[id]/api-keys/[keyId]` revokes a project key.
- `GET /api/projects/[id]/install-github` starts GitHub App install.
- `GET /api/projects/[id]/install-github/callback` binds installation ID.

Auth and account API:

- `GET|POST /api/auth/[...all]` is delegated to `better-auth`.
- `POST /api/wallets/nonce` issues SIWS nonces.
- `POST /api/wallets/verify` verifies SIWS and links the project owner's
  launch wallet.
- `POST /api/auth/mfa/enroll`, `/verify`, and `/revoke` manage TOTP MFA.
- `GET /api/github/me/repos` lists launchable repos for the current user.

Platform and automation API:

- `POST /api/admin/refresh-contributors`
- `POST /api/admin/promote-from-stub`
- `GET /api/cron/*` workflow triggers, protected by `CRON_SECRET`
- `POST /api/webhooks/github` GitHub webhook receiver with HMAC verification
- `GET /api/health` deployment health check
- `GET /api/health?strict=1` deployment readiness check; returns 503 if any
  production integration is missing, stubbed, or failing.

Mutation invariants:

- Revalidate the current session in every protected route and Server Action.
- Call `requirePermission` for project/admin mutations.
- Validate input with Zod before side effects.
- Accept and respect `Idempotency-Key` for mutating endpoints. Workflow steps
  use deterministic keys, especially around external calls.
- Append an audit log entry after successful mutation.
- Revalidate route/cache tags after writes that affect visible pages.
- External responses from Bags, GitHub, and Solana are parsed through typed
  boundaries before reaching app code.

## Bags Integration

The current live Bags path is centralized in
[`apps/web/lib/bags/client.ts`](./apps/web/lib/bags/client.ts):

1. `bags.createTokenInfo()` calls
   `sdk.tokenLaunch.createTokenInfoAndMetadata()` and validates the returned
   `tokenMint` and `tokenMetadata`.
2. `bags.createFeeShareConfig()` resolves social claimers through
   `sdk.state.getLaunchWalletV2Bulk()`, merges duplicate wallets, adds the
   GitShipt platform fee wallet, and calls
   `sdk.config.createBagsFeeShareConfig()`.
3. Fee-share config transactions returned by Bags are signed through the
   server-side signer only after instruction-policy checks.
4. Contributor claims stay in Bags. GitShipt records claim events and runs
   cadence-driven BPS rebalances; it does not expose `/api/claims/*`.

GitShipt deliberately keeps two revenue rails separate:

- Contributor/pool accounting is expressed through fee claimers that total
  exactly 10,000 bps.
- Bags partner config is optional and controlled through `BAGS_PARTNER_*` env
  values, not mixed into contributor payout math.

The final Bags launch transaction is still gated behind launch-wallet and
initial-buy configuration. Until those economics are explicitly configured, the
app records the metadata mint and fee-share config key, plus the last fee-share
config transaction signature when live. Without Bags, Helius, or payout-key
credentials, launch stays in deterministic stub mode.

## Workflows

Workflow files live in [`apps/web/workflows`](./apps/web/workflows):

- `indexGithubDeltas` and `indexProjectDeltas` import GitHub activity.
- `computeLeaderboard` turns activity into ranked contributors.
- `takeSnapshot` freezes daily leaderboard state.
- `rebalanceBps` updates Bags fee-share BPS weights on the project cadence.
- `claimPartnerFees` claims GitShipt partner fees through Bags-native
  partner-claim transactions.
- `publishKpis` refreshes public metrics.

Vercel Workflow step idempotency is not automatic. Any external API call inside
a step must use a deterministic key, usually derived from
`getStepMetadata().stepId`.

## Design System

Tailwind v4 reads CSS variables from
[`apps/web/app/globals.css`](./apps/web/app/globals.css). Component code must
use semantic utilities such as `bg-surface`, `text-fg`, `text-fg-secondary`,
`border-border-strong`, and rank tokens. Do not place raw hex values in
components.

Money, token amounts, BPS values, timestamps, tx signatures, and scores use
`text-mono-sm` or `text-mono-md`. Body copy does not use mono.

Theme scripts:

- `bun run theme:export` regenerates `.theme/tokens.json` from the web app
  theme CSS.
- `bun run theme:lint` checks raw hex drift in `apps/web` and `packages`.

## Deployment

The root [`vercel.json`](./vercel.json) is the Vercel source of truth. Link the
Vercel project from the repository root, not `apps/web`, so the Bun workspace
graph, shared packages, root lockfile, and cron configuration are all visible to
Vercel.

Important deployment settings:

- Framework preset: `nextjs`
- Root directory: repository root (`.`)
- Install command: `bun install --frozen-lockfile`
- Build command: `bun run build`
- Development command: `bun run dev -- --port $PORT`
- Output directory: `apps/web/.next`
- Local Bun pin: `1.3.13`
- Vercel Bun runtime: `1.x` in `vercel.json`, so Vercel uses its latest
  supported Bun 1.x runtime while package metadata keeps local installs pinned.
- Function region: `iad1`, colocated with the current US East Neon/Redis setup.
- Fluid Compute: enabled for workflow and cron-heavy routes.
- Cron paths stay unchanged because the Next app still owns `/api/cron/*`.

### Bun HTTP/3

Bun HTTP/3 support (`Bun.serve({ h3: true })` and experimental
`fetch(..., { protocol: "http3" })`) landed on Bun `main` after the 1.3.13
stable release. GitShipt stays on stable Bun for production Next/Vercel builds;
use `bun upgrade --canary` locally and run `bun run bun:http3:check` before
testing those APIs. Do not wire HTTP/3-only behavior into money-moving Bags or
Solana paths until Bun ships the feature in a stable release and the target API
origin is verified to support it.

The Vercel project must have the Marketplace Neon/Postgres and Redis variables,
GitHub OAuth/App variables, Bags variables, Solana variables, and `CRON_SECRET`
configured in every environment that runs the app. Mark every `*_KEY`,
`*_SECRET`, token, and keypair value as Sensitive in Vercel. Do not set
`NODE_ENV` manually in Vercel; Next/Vercel own it.

## Verification

Use the tight checks before shipping:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run theme:lint
bun run test
bun run e2e
bun run build
```

For browser-level route smoke tests, run `bun run dev` and check public routes,
protected redirects, dashboard shell stability, and auth state persistence while
navigating the sidebar.

## Scripts

- `bun run dev` starts the Next dev server for `@repo/web`.
- `bun run build` creates a production build.
- `bun run start` serves the production build.
- `bun run typecheck` checks all packages plus the web app.
- `bun run lint` runs the web ESLint config.
- `bun run test` runs the current Vitest suite through the root test script.
- `bun run e2e` runs Playwright.
- `bun run db:generate`, `bun run db:migrate`, `bun run db:push`, and
  `bun run db:studio` manage Drizzle from `apps/web`.
- `bun run format` formats source, Markdown, JSON, and CSS.
