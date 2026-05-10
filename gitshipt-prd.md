# GitShipt — Product Requirements Doc

**Hackathon**: Bags.fm Hackathon (submissions close April 28, 2026)
**Owner**: SYMBiEX
**Status**: Draft v1 (lock at submission)

---

## Architecture pointer (2026-05-09)

The architecture sections below this pointer reflect the **corrected understanding** of Bags fee-share capabilities. GitShipt uses a Bags-native architecture with:

- **Manager role** (delegated to GitShipt): BPS rebalancing within claimer set
- **Admin role** (held by project owner): Can add/remove claimers post-launch
- **Partner role** (GitShipt partner config): Receives 25% of trading fees from all launched tokens
- **Dynamic contributor inclusion**: Claimers CAN be updated post-launch via admin authority
- **Zero SOL custody**: Contributors claim directly from Bags, GitShipt claims partner fees directly

- Decision record: [`docs/adr/0001-bags-native-payout.md`](docs/adr/0001-bags-native-payout.md) (updated 2026-05-09)
- Research backing: [`docs/architecture/bags-native/RESEARCH.md`](docs/architecture/bags-native/RESEARCH.md)

For any decision touching payouts, escrow, claims, or wallet linking,
trust SPEC.md + the updated ADR over this PRD's architecture text until the PRD
itself is rewritten.

---

## TL;DR

GitShipt is a launchpad-leaderboard hybrid where any GitHub repo can spawn a Bags.fm token. Token fees route to that repo's top contributors through Bags-native fee sharing, with GitShipt receiving 25% of trading fees via Bags partner configuration (no launch fees). We ship the platform by launching its own token at the demo and rewarding our own contributors live.

**One-liner**: Pump.fun for open source. The repo is the project, the contributors are the rewards.

---

## Hackathon constraints

- Submission deadline: April 28, 2026 (3-day build)
- Demo lever: meta-launch of GitShipt's own token at submission
- "Wow factor": every commit pushed during the hackathon turns the committer into a payout recipient on stage

---

## Verified architecture (as of May 9, 2026)

This PRD has been verified against current platform docs. Material decisions and their sources:

1. **Bags Token Launch v2 has native fee sharing with direct wallets and social identity lookup**. GitShipt uses Bags' partner configuration system to receive 25% of trading fees from all launched tokens. Bags can resolve supported social identities (`github`, `twitter`, `kick`, `tiktok`, and legacy `moltbook`) to wallets for contributor fee recipients. Maximum 100 fee earners per token (including creator). Source: Bags API changelog, Bags skill, and SDK examples (`@bagsfm/bags-sdk`).

2. **Fee shares CAN be updated post-launch via admin authority**. The Bags CLI provides `bags config update` and the API provides `POST /fee-share/admin/update-config` to change fee claimers and their BPS allocations after launch. This enables dynamic contributor inclusion - new contributors can be added to the claimer set as they emerge, and inactive contributors can be removed. GitShipt platform revenue comes via the separate partner-key rail (`partner` + `partnerConfig`) which receives 25% of trading fees, independent of the 10,000 BPS contributor envelope.

3. **Next.js 16.2 is current** (March 18, 2026). Cache Components, React Compiler, and Turbopack are all stable. **Critical**: `middleware.ts` is renamed to `proxy.ts` in Next.js 16. Patch level must be current to mitigate React Server Components RCE (CVE-2025-66478, CVSS 10.0, December 2025) and middleware bypass (CVE-2025-29927).

4. **Vercel Postgres is deprecated**. Use Neon Postgres via Vercel Marketplace. The app prefers Neon's server-only `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) variables, with `POSTGRES_URL` aliases accepted for generic Postgres compatibility.

5. **Vercel Workflows is GA, Vercel Queues is public beta** (no allowlist). Workflows is built on Queues + Fluid Compute + managed persistence. Configured via `experimentalTriggers` in `vercel.json`. Run-level limits: ~2000 events or ~1 GB storage before replay slows down. Fan out via child workflows.

6. **Vercel security incident, April 19, 2026**. Compromised AI tool's OAuth token gave attackers access to Vercel internal systems. Non-sensitive env vars were readable. **All secrets must be flagged Sensitive in the dashboard or via API (`type: "sensitive"`).** Crypto teams are particularly exposed; cold treasury keys never touch Vercel.

7. **Solana SDK**: stay on `@solana/web3.js@^1.98` (v1 line). The Bags SDK uses v1-style imports (`Connection`, `Keypair`, `PublicKey`, `VersionedTransaction`). v2 (`@solana/kit`) is GA but ecosystem migration is incomplete.

8. **Auth**: `better-auth` for GitHub OAuth, with a custom plugin for Sign-In With Solana. SIWS standard is published by Phantom (`@phantom/sign-in-with-solana`). `Credentials`-style provider on Auth.js v5 is the fallback if better-auth's plugin model doesn't fit.

9. **Postgres driver**: `drizzle-orm/neon-http` for Neon runtime queries, `drizzle-orm/neon-serverless` where Neon transactions span multiple statements, and `drizzle-orm/postgres-js` only for generic Postgres compatibility.

10. **UI**: Tailwind v4 + shadcn/ui (CSS-first config, `@theme` directive, no `tailwind.config.js`). Confirmed standard 2026 stack.

## Assumptions to confirm with team

| #   | Assumption                                                                                                         | Confirm by                                 |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1   | Platform-as-sole-claimer model is acceptable to Bags (vs native multi-wallet at launch)                            | Sync with Teddy                            |
| 2   | Fee claim cadence: daily 00:30 UTC OK, or per-project?                                                             | Default daily, ship configurable post-MVP  |
| 3   | Hot wallet sits inside Vercel env (`Sensitive`-flagged) for v0; treasury is hardware-wallet-only                   | Confirm with security review               |
| 4   | Top 10 default tier weights `[0.30, 0.20, 0.15, 0.05 × 7]`                                                         | Default; configurable per-project post-MVP |
| 5   | Scoring v0 = commits + merged PRs only, 30d window                                                                 | Locked for hackathon                       |
| 6   | GitShipt revenue comes from the Bags partner configuration, not a treasury claimer inside the contributor envelope | Lock to ADR / SPEC                         |

---

## Personas

| Persona        | Goal                                            | Friction tolerance                        |
| -------------- | ----------------------------------------------- | ----------------------------------------- |
| Repo Owner     | Reward maintainers, capture upside, get noticed | Medium - will tolerate setup wizard       |
| Contributor    | Passive payouts for past/ongoing work           | Very low - one click + wallet link        |
| Trader         | Bet on quality OSS via tokens                   | Low - wants instant Bags-style trading UX |
| Platform Admin | Total control, kill switch, audit, fee config   | High - tools first, polish later          |

---

## Core flows

### F1. Launch flow (Repo Owner)

1. Sign in with GitHub (App install if not present).
2. Pick a repo (we verify admin perms via App permissions).
3. Configure token: name, symbol, supply, image, description (validated against Bags rules + our own filter).
4. Configure leaderboard: window (default 30d), top-N (default 10).
5. Link a Solana wallet with SIWS. Server creates Bags metadata + fee-share config, then the repo owner reviews and signs the final Bags launch transaction in their wallet. The linked wallet is the launch signer and funds any configured initial buy.
6. Project goes live. Initial contributor index runs immediately. First snapshot at next 00:00 UTC.

### F2. Contribute and earn (Contributor)

1. Hit `/u/[githubUsername]` (auto-generated, public, indexed).
2. Click "Claim earnings" → continue to Bags.
3. Bags handles GitHub identity, wallet connection, and fee claims directly. GitShipt never holds contributor claim balances.

### F3. Daily Bags rebalance (System)

1. **23:30 UTC**: indexer reconciles GitHub deltas for all live projects.
2. **00:00 UTC**: leaderboard snapshot generated, frozen, hashed (Merkle root persisted).
3. **00:15 UTC**: GitShipt computes snapshot-derived contributor BPS targets.
4. **00:30 UTC**: Bags fee-share config is rebalanced via delegated manager authority when targets changed.
5. Failures retry with exponential backoff (5m, 15m, 1h, 6h). Permanent failures escalate to admin workflow queue.

### F4. Admin oversight

1. Live dashboard: queue depth, payout volume, error rate, treasury balance.
2. Project review queue with sybil and abuse flags.
3. Per-project kill switch (pauses payouts and trading-aware endpoints, locks new launches).
4. Fee config and treasury wallet management with MFA gate on every change.

---

## System architecture

```
[Browser]
   │
   ▼
[Vercel Edge Network]
   │
   ▼
[Next.js 16 on Fluid Compute] ── RSC + Server Actions ──▶ [Neon Postgres]
   │                                                          ▲
   │                                                          │
   ├── enqueue ──▶ [Vercel Queues] ──▶ [Workflow Runs] ───────┤
   │                                       │
   ├── trigger ──▶ [Vercel Cron] ──▶ [Root Workflow] ──┐      │
   │                                                   │      │
   │                                  fan-out          ▼      │
   │                                  to child workflows ─────┤
   │                                                          │
   └── cache + nonces + rate-limit ──▶ [Upstash Redis] ◀──────┘

External:
- GitHub App (webhooks: push, PR, review, issues, installation)
- Bags.fm API (launch, fee accrual, distribution)
- Solana RPC (Helius - wallet verification, signing, distribution)
```

### Trust boundaries

- Browser ↔ Next.js: better-auth session cookies, HttpOnly + Secure + SameSite=Lax.
- Next.js ↔ Workflows: same Vercel project, same env, same secrets. No cross-network HTTP.
- Workflow steps ↔ Bags API: server-only, key in Vercel env (encrypted at rest).
- Workflow steps ↔ Solana: server-side manager key may sign Bags BPS
  rebalances and partner fee claims. Contributor claim balances stay in Bags.

---

## Page and route map

### Public

| Path                             | Purpose                                                               |
| -------------------------------- | --------------------------------------------------------------------- |
| `/`                              | Landing: hero, live ticker (24h volume + payouts), top 10 projects    |
| `/explore`                       | All projects, filters: 24h fees, contributors, age, status            |
| `/r/[org]/[repo]`                | Project page: token chart, leaderboard, contributor cards, repo links |
| `/r/[org]/[repo]/snapshots`      | Historical snapshot ledger                                            |
| `/u/[username]`                  | Contributor profile: lifetime earnings, projects, repos               |
| `/launch`                        | Launch wizard (gated to authed repo owners)                           |
| `/docs`                          | Markdown docs                                                         |
| `/legal/terms`, `/legal/privacy` | Legal                                                                 |
| `/auth/signin`                   | GitHub OAuth                                                          |
| `/auth/wallet`                   | SIWS flow                                                             |

### Authenticated `/dashboard/*`

| Path                                | Purpose                                     |
| ----------------------------------- | ------------------------------------------- |
| `/dashboard`                        | Overview: my projects, my earnings, alerts  |
| `/dashboard/projects`               | Owned projects                              |
| `/dashboard/projects/[id]`          | Project console: leaderboard, fees, payouts |
| `/dashboard/projects/[id]/scoring`  | Weights, window, exclusions                 |
| `/dashboard/projects/[id]/payouts`  | Payout history                              |
| `/dashboard/projects/[id]/settings` | Token meta, kill switch, ownership transfer |
| `/dashboard/wallets`                | Linked wallets                              |
| `/dashboard/earnings`               | Earnings overview with Bags claim handoff   |
| `/dashboard/api-keys`               | Personal API keys (scoped)                  |

### Admin `/admin/*` (MFA + role gate)

| Path                   | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `/admin`               | Ops dashboard: queues, errors, KPIs, treasury     |
| `/admin/projects`      | All projects, filters, bulk actions               |
| `/admin/projects/[id]` | Force pause, override scoring, blacklist users    |
| `/admin/users`         | Users, role management, sybil flags               |
| `/admin/payouts`       | Payout queue, retry, force-cancel, manual trigger |
| `/admin/snapshots`     | Snapshot history, hash verification               |
| `/admin/fees`          | Platform fee bps, treasury wallet config          |
| `/admin/workflows`     | Workflow runs, step traces, retries, dead letters |
| `/admin/integrations`  | Bags API health, GitHub App installs              |
| `/admin/audit`         | Audit log (immutable, append-only)                |
| `/admin/abuse`         | Reports, sybil flags, plagiarism review           |
| `/admin/settings`      | Global flags, maintenance mode, kill switch       |

---

## Data model (Drizzle, Postgres)

| Table                        | Key columns                                                                                                                                                                                                                          | Notes                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `users`                      | `id`, `github_id` UNIQUE, `github_username`, `email`, `role`, `mfa_secret_enc`, `created_at`                                                                                                                                         | `role`: `user \| moderator \| admin \| super_admin`                |
| `wallets`                    | `id`, `user_id` FK, `address`, `chain`, `verified_at`, UNIQUE(`user_id`,`address`)                                                                                                                                                   | `chain` default `solana`                                           |
| `projects`                   | `id`, `owner_user_id` FK, `gh_owner`, `gh_repo`, `gh_repo_id`, `gh_installation_id`, `token_mint`, `bags_launch_id`, `bags_launch_wallet`, `status`, `platform_fee_bps`, `scoring_config` JSONB, `payout_config` JSONB, `created_at` | `status`: `draft \| launch_configured \| live \| paused \| killed` |
| `contributors`               | `id`, `project_id` FK, `gh_user_id`, `gh_username`, `score`, `rank`, `last_indexed_at`                                                                                                                                               | INDEX(`project_id`,`rank`)                                         |
| `contributor_claims`         | `contributor_id` FK, `user_id` FK NULL, `wallet_address`, `claimed_at`                                                                                                                                                               | Null user until claim                                              |
| `snapshots`                  | `id`, `project_id` FK, `taken_at`, `leaderboard` JSONB, `merkle_root`, `total_fees_lamports`, `formula_version`, `status`                                                                                                            | Frozen ledger                                                      |
| `payouts`                    | `id`, `snapshot_id` FK, `project_id` FK, `total_amount`, `status`, `attempt_count`, `last_error`, `scheduled_at`, `executed_at`                                                                                                      | INDEX(`status`,`scheduled_at`)                                     |
| `payout_recipients`          | `id`, `payout_id` FK, `contributor_id` FK, `wallet_address`, `amount`, `status`, `tx_signature`, `idempotency_key` UNIQUE                                                                                                            | Per-recipient row                                                  |
| `partner_fee_claim_attempts` | `partner_wallet`, `partner_config_key`, `status`, `signatures`, `before_stats`, `after_stats`, `idempotency_key`                                                                                                                     | GitShipt partner revenue claim ledger                              |
| `platform_config`            | `key` PK, `value` JSONB, `updated_by`, `updated_at`                                                                                                                                                                                  | All global tunables                                                |
| `audit_logs`                 | `id`, `actor_user_id`, `action`, `target_type`, `target_id`, `metadata` JSONB, `ip`, `user_agent`, `created_at`                                                                                                                      | Append-only DB role                                                |
| `webhooks_inbox`             | `id`, `source`, `event_id` UNIQUE, `signature`, `payload`, `processed_at`                                                                                                                                                            | Idempotency on `event_id`                                          |
| `gh_indexer_state`           | `project_id` PK, `last_event_cursor`, `last_full_sync_at`                                                                                                                                                                            | Resume tokens                                                      |

---

## Scoring algorithm

Per contributor, in window `W` (default 30d):

```
score =
  3.0 * mergedPRs +
  1.0 * commitsToDefaultBranch +
  1.5 * approvedReviews +
  0.5 * closedIssuesAuthored +
  0.2 * log10(1 + netLinesChanged)
```

**Modifiers**:

- Bot accounts (login matches `/^(.*-bot|dependabot|.*-ci|renovate)$/` or in admin allowlist) excluded.
- Self-merge (PR author == merger) weighted 0.5x.
- Linear time decay: `(W - daysAgo) / W`.

**Reproducibility**: every snapshot stores `formula_version` and the full per-contributor input (PRs, commits, reviews, issues, lines). Re-running a snapshot must produce the same result.

**MVP cut**: only `mergedPRs` and `commitsToDefaultBranch` for the hackathon. Reviews and issues land in v1.1.

---

## Bags.fm integration (verified)

### Token launch flow

```ts
import { BagsSDK } from "@bagsfm/bags-sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const sdk = new BagsSDK(
  process.env.BAGS_API_KEY!,
  new Connection(process.env.HELIUS_RPC_URL!),
  "processed",
);

// Step 1: create token info (uploads metadata, returns tokenMint + metadataUrl)
const tokenInfo = await sdk.tokenLaunch.createTokenInfoAndMetadata({
  name: "GitShipt",
  symbol: "GSHIPT",
  description:
    "Token for the gitshipt repo. Fees route to top contributors through Bags.",
  imageUrl: "https://gitshipt.com/og/gitshipt.png",
});

// Step 2: create fee share config
// MVP model: direct wallet claimers total 10,000 bps. Partner attribution is
// separate from GitShipt's own fee-claimer rail.
const { meteoraConfigKey } = await sdk.config.createBagsFeeShareConfig({
  payer: launchWallet.publicKey,
  baseMint: tokenInfo.tokenMint,
  feeClaimers: [
    { user: poolClaimerWallet, userBps: 10000 }, // contributor envelope
    // GitShipt revenue is separate: Bags partner config, not a claimer slot.
  ],
  partner: new PublicKey(process.env.BAGS_PARTNER_WALLET!),
  partnerConfig: process.env.BAGS_PARTNER_CONFIG_KEY
    ? new PublicKey(process.env.BAGS_PARTNER_CONFIG_KEY)
    : undefined,
});

// Step 3: create launch transaction
const launchTx = await sdk.tokenLaunch.createLaunchTransaction({
  metadataUrl: tokenInfo.tokenMetadata,
  tokenMint: tokenInfo.tokenMint,
  launchWallet: launchWallet.publicKey,
  initialBuyLamports: 0,
  configKey: meteoraConfigKey,
});

// Step 4: sign and broadcast
const signature = await signAndSendTransaction(
  connection,
  "processed",
  launchTx,
  launchWallet,
);
```

### Partner API and referral attribution

`BAGS_API_KEY` is the private server credential for the Bags public API. It is
not the partner key. Token launches and Bags-hosted handoff URLs also attach
the GitShipt partner wallet `HXs58Qa6YtgJfWVkQVnpFmw6WoEdFEL4LLD1ArZjMvTH` and
referral code `symbiex` (`https://bags.fm/?ref=symbiex`) unless an explicit
override is passed for a specialized partner campaign.

### Daily leaderboard snapshot and Bags rebalance

Contributor funds stay in Bags. GitShipt does not claim contributor fees into a
hot wallet or redistribute them. The daily automation computes a reproducible
leaderboard snapshot and, when the ranking changed enough to matter, asks Bags
to update the fee-share BPS allocation under the delegated manager role:

```ts
// workflows/rebalanceBps.ts
"use workflow";

export async function rebalanceBps() {
  const projects = await fetchActiveProjects(); // 'use step'
  await Promise.all(projects.map((p) => rebalanceProjectBps(p.id)));
}

export async function rebalanceProjectBps(projectId: string) {
  "use workflow";
  const project = await loadProject(projectId); // step
  const snapshot = await loadLatestSnapshot(projectId); // step
  const plan = computeContributorBps(snapshot); // pure
  if (!needsManagerRebalance(project, plan)) return;
  const sig = await updateBagsFeeShareConfig(project, plan); // step
  await recordBpsRebalance(projectId, snapshot.id, plan, sig); // step
}
```

### Bags API endpoints we use

| Purpose                                | Endpoint                                                                                       | When                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| Resolve GitHub username to Bags wallet | `GET /api/v1/token-launch/fee-share/wallet/v2?provider=github&username={u}`                    | Launch + onboarding      |
| Create fee share config                | `POST /api/v1/fee-share/config`                                                                | Launch                   |
| Create launch tx                       | `POST /api/v1/token-launch/create-launch-transaction`                                          | Launch                   |
| List claimable positions               | `GET /api/v1/token-launch/claimable-positions?wallet={addr}`                                   | Contributor/Bags handoff |
| Claim fees (SDK)                       | `sdk.fee.*`                                                                                    | Contributor/Bags handoff |
| Partner fee stats + claim txs          | `sdk.partner.getPartnerConfigClaimStats()` / `sdk.partner.getPartnerConfigClaimTransactions()` | Admin fees console       |
| Lifetime fees (analytics)              | `GET /api/v1/token-launch/lifetime-fees?tokenMint={m}`                                         | Project page             |
| Token holders (top N)                  | SDK `analytics.getTokenHolders`                                                                | Optional dividend mode   |

### Constraints to design around

- **Max 100 fee claimers per token** including creator. GitShipt must reserve room for project-owner and contributor claimers, then skip or later add overflow contributors through Bags admin updates instead of exceeding Bags limits.
- **Bags rate limit**: 1,000 requests/hour per API key. With cron driving most calls, this is plenty. Workflows step retries don't compound (each step is idempotent).
- **JWT tokens last 365 days, rotate if compromised**. API keys are separate from JWT tokens. We use API keys for backend, never JWTs.
- **Token launches require fee sharing config**: the old no-share flow is no longer supported.
- **Fee claimers support direct wallets**: GitShipt registers Bags-resolved contributor wallets wherever possible. Later config updates can add verified contributor wallets via Bags admin updates. Unlinked contributors, overflow contributors, and BPS rounding dust remain excluded until they can be safely represented in the Bags claimer set.

---

## Payout math

The Bags fee-share config allocates 10,000 BPS explicitly across the project owner and Bags-resolved contributor wallets. GitShipt revenue is separate: launches include the GitShipt Bags partner key so the platform can claim partner revenue from Bags without reducing the contributor envelope.

The daily rebalance workflow updates Bags-native BPS allocations; contributors claim through Bags:

```
latestSnapshot = frozen leaderboard snapshot
newBps         = allocate 10,000 BPS across active Bags claimers
manager signs  = Bags fee-share config BPS rebalance
```

Default tier weights (top 10): `[0.30, 0.20, 0.15, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05]`.

If a contributor has not onboarded to Bags, GitShipt does not create an off-chain balance. The contributor can be added later by the project owner/admin rail once Bags can resolve their GitHub identity.

**Why Bags-direct routing**: Bags owns fee custody and claims. GitShipt's job is to keep the leaderboard, snapshots, and Bags BPS allocation in sync with repo activity.

---

## API surface

### Internal (Server Actions + Route Handlers)

| Method | Path                             | Purpose                             |
| ------ | -------------------------------- | ----------------------------------- |
| POST   | `/api/projects`                  | Create project (auth + repo verify) |
| POST   | `/api/projects/[id]/launch`      | Fire Bags launch                    |
| GET    | `/api/projects/[id]/leaderboard` | Cached leaderboard (5min)           |
| POST   | `/api/wallets/verify`            | SIWS verify                         |
| POST   | `/api/admin/projects/[id]/pause` | Admin pause                         |
| POST   | `/api/admin/payouts/[id]/retry`  | Admin retry                         |
| POST   | `/api/webhooks/github`           | GitHub webhook receiver (HMAC)      |
| POST   | `/api/webhooks/bags`             | Bags webhook receiver (HMAC)        |

### Cron / Workflows

All background work runs as **Vercel Workflows** triggered by **Vercel Cron Jobs** or webhooks. Each workflow is a `"use workflow"` function with `"use step"` units that are individually retried, persisted, and resumable across deploys.

| Workflow             | Trigger                       | Cadence         | Pattern                                             |
| -------------------- | ----------------------------- | --------------- | --------------------------------------------------- |
| `indexGithubDeltas`  | Vercel Cron + GitHub webhook  | every 15m       | Root workflow fans out one child per active project |
| `computeLeaderboard` | Internal (post-index) or cron | hourly          | Per-project, idempotent                             |
| `takeSnapshot`       | Vercel Cron                   | daily 00:00 UTC | Freezes leaderboard, persists Merkle root           |
| `rebalanceBps`       | Internal (post-snapshot)      | daily 00:30 UTC | Applies snapshot-derived contributor BPS in Bags    |
| `claimPartnerFees`   | Workflow + admin action       | daily / manual  | Claims GitShipt Bags partner revenue                |
| `healthPulse`        | Vercel Cron                   | every 1m        | Heartbeat to admin dashboard                        |

**Pro plan required**: Hobby cron is daily-only with ±60min imprecision. Pro unlocks per-minute schedules and tight timing (needed for 00:00 UTC snapshots).

**Step-level guarantees**: Each step gets automatic retries (configurable backoff), durable persistence of inputs/outputs, and full observability in the Vercel Workflows dashboard. No dead-letter queues to manage. Mid-run deploys resume from the last completed step.

---

## Security baseline

- **Auth**. better-auth with GitHub OAuth. Sessions in Postgres. Cookies HttpOnly + Secure + SameSite=Lax.
- **Wallet auth**. SIWS message includes domain, nonce (Redis 5min TTL), `issuedAt`, signed via Phantom or Backpack.
- **Admin**. Separate session realm. TOTP MFA required. WebAuthn post-MVP.
- **RBAC**. `user`, `project_owner` (own projects only), `moderator`, `admin`, `super_admin`. Enforced in middleware and at DB layer via row-level policies on sensitive tables.
- **Rate limits**. Per-IP and per-user via Redis token bucket. Stricter on `/api/wallets/verify`, `/api/projects` POST, login.
- **Webhooks**. HMAC verification, replay protection via `webhooks_inbox.event_id` UNIQUE.
- **Secrets**. Vercel env vars (encrypted at rest), scoped per environment (preview vs production). Payout signing key marked `Sensitive` (write-only after creation). Never client-shipped.
- **Idempotency**. `Idempotency-Key` header on all mutating routes, Redis-backed.
- **Headers**. CSP strict, HSTS, X-Frame-Options DENY, no inline scripts where avoidable, Trusted Types.
- **Audit**. Every admin action and every payout writes to `audit_logs`. Append-only enforced via DB role (no UPDATE/DELETE perm).
- **PII**. Minimized. No KYC stored. Wallet addresses + GitHub handle only.
- **Backups**. Postgres PITR + nightly snapshot to S3.
- **Hot wallet hygiene**. Daily-capped balance, refilled from cold treasury via signed admin action with MFA + reason.
- **DR**. Bags or GitHub outage degrades gracefully. Snapshots queue and retry. No silent data loss.

### Pre-launch security checklist

- [ ] All `/api/*` mutating routes have idempotency keys
- [ ] All admin actions write audit log entries
- [ ] All webhooks verify HMAC before processing
- [ ] No client component imports server-only secrets
- [ ] CSP report-only mode validated, then enforced
- [ ] Rate limiter tested for all auth and mutation endpoints
- [ ] Hot wallet balance cap enforced in payout executor
- [ ] Kill switch verified end-to-end (single-project + global)
- [ ] DB roles split: `app_rw`, `app_ro`, `audit_append_only`, `migrate`
- [ ] SIWS nonce cannot be replayed across sessions

---

## MVP scope (hackathon cut, April 28)

**In**:

- GitHub OAuth + Solana wallet linking via SIWS
- Single-repo launch flow → Bags token created
- GitHub indexer (commits + merged PRs only)
- Daily snapshot + payout cron on devnet
- Public project page + leaderboard (matches the supplied mockup)
- Project admin console: Overview, Leaderboard, Payouts, Settings (the highest-value tabs)
- Contributor Bags claim handoff
- Super-admin console: Ops dashboard, kill switch, fee config, audit log, payout retry, treasury (read-only)
- DESIGN.md committed and Tailwind theme generated from it
- "Eat our own dog food" - GitShipt repo launches first token at demo

**Out (v1.1+)**:

- Reviews + issues in scoring
- Multi-repo / monorepo
- Custom tier weights UI
- WebAuthn (TOTP only at hackathon)
- Public docs site beyond a single page
- Trader features (alerts, watchlists, sub feeds)
- Repository, Token, API Keys, Team tabs in project console (read-only stubs at hackathon, full UI v1.1)
- DB sandbox, feature flags, abuse review surfaces in super-admin (stubs at hackathon)

---

## Stack and infra

| Layer          | Choice                                                                                                                                           | Reason                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web            | Next.js 16.2 (App Router, RSC, Server Actions, Turbopack) on **Vercel Fluid Compute**                                                            | Stack constraint, latest features, up to 14min execution. Patched against CVE-2025-66478 and CVE-2025-29927.                                               |
| Lang           | TypeScript strict                                                                                                                                | Non-negotiable                                                                                                                                             |
| UI             | Tailwind v4 (`@theme` directive, no `tailwind.config.js`) + shadcn/ui + Tremor (admin charts) + Lucide                                           | Standard 2026 stack                                                                                                                                        |
| Design system  | **DESIGN.md** at project root (Google Labs spec, Apache 2.0)                                                                                     | Persistent design context for all coding agents (Claude Code, Cursor, Copilot). See companion `DESIGN.md` file.                                            |
| DB             | **Neon Postgres** via Vercel Marketplace                                                                                                         | Injects server-only Postgres connection strings; use `DATABASE_URL` for runtime queries and `DATABASE_URL_UNPOOLED` for direct migration/transaction work. |
| ORM            | Drizzle (`drizzle-orm/neon-http` for Neon runtime reads/writes, `neon-serverless` for transactional flows, `postgres-js` fallback) + drizzle-kit | Type-safe SQL and portable Postgres access while preserving generic Postgres compatibility.                                                                |
| Background     | **Vercel Workflows + Vercel Queues** (`'use workflow'` / `'use step'`, `experimentalTriggers` config)                                            | Durable steps, automatic retries, survives deploys, no separate worker service. Workflow SDK is open-source so portable if we ever leave.                  |
| Cache / nonces | **Upstash Redis (via Vercel Marketplace)**                                                                                                       | One-click integration. Used only for cache, SIWS nonces, rate limit, idempotency keys.                                                                     |
| Cron           | **Vercel Cron Jobs** (Pro plan required for sub-daily)                                                                                           | Native, secured via `CRON_SECRET`                                                                                                                          |
| Auth           | **better-auth** with GitHub OAuth + custom SIWS plugin (`@phantom/sign-in-with-solana`)                                                          | Modern, declarative, extensible. Auth.js v5 fallback if SIWS plugin model proves friction.                                                                 |
| Solana         | `@solana/web3.js@^1.98.x` (v1 line, locked post-Dec-2024 supply chain incident), `@solana/spl-token`, Helius RPC, `@bagsfm/bags-sdk`             | Bags SDK uses v1-style imports. Don't move to v2/`@solana/kit` until Bags ports.                                                                           |
| Observability  | Vercel Workflows dashboard, Vercel Observability, Sentry                                                                                         | Built-in for workflows, Sentry for app errors                                                                                                              |
| CI/CD          | GitHub Actions, preview envs on Vercel                                                                                                           | Per-PR preview                                                                                                                                             |
| Testing        | Vitest (unit), Playwright (e2e launch flow)                                                                                                      | Realistic coverage                                                                                                                                         |
| Local dev      | Bun for scripts/build tooling, Workflow Local World for offline workflow testing                                                                 | Fast, runs same workflow code locally                                                                                                                      |
| Secrets        | Vercel env vars, **all flagged Sensitive**                                                                                                       | Single source of truth post-April-2026 incident. Cold treasury key never enters Vercel.                                                                    |

---

## Design system (DESIGN.md)

GitShipt ships a `DESIGN.md` file at the repo root, conforming to **Google Labs' DESIGN.md spec** (open-sourced April 21, 2026, Apache 2.0). DESIGN.md gives every coding agent (Claude Code, Cursor, Copilot, Stitch) a persistent, structured understanding of the visual identity. Drop a request like "build the Payouts page" into any agent and the output is on-brand without per-prompt design briefing.

### Why this matters for hackathon velocity

Every component generated during the 3-day sprint pulls from the same token table. No "the agent picked Tailwind blue again" loops. The same file feeds into the production Tailwind theme via `bunx @google/design.md export --format tailwind DESIGN.md > .theme/tokens.json` and gets linted in CI for token integrity and WCAG AA contrast.

### Aesthetic direction

**Cypherpunk dark-green.** Near-black surfaces (`#08080C`), single signature GitShipt-green accent (`#4A9B3D`), Geist + Geist Mono typography, flat depth model (no glow halos, no gradients, no neumorphism), monospace numerics for every economically-meaningful figure. Trader's terminal density meets engineer-respecting legibility. See `DESIGN.md` for full token table and rationale.

### Token highlights (excerpt — see file for complete schema)

```yaml
colors:
  bg: "#08080C"
  surface: "#101015"
  surface-elevated: "#16161E"
  border: "#23232E"
  primary: "#4A9B3D" # GitShipt green, one per viewport
  primary-fg: "#F5F5F7" # off-white text/icon color on green controls
  fg: "#F5F5F7"
  fg-secondary: "#9494A0"
  fg-muted: "#80808C"
  success: "#22C55E" # live indicators, gains
  rank-gold: "#FBBF24"
  rank-silver: "#CBD5E1"
  rank-bronze: "#D97706"

typography:
  display: { fontFamily: Geist, fontSize: 48px, fontWeight: 600 }
  headline-md: { fontFamily: Geist, fontSize: 24px, fontWeight: 600 }
  body-md: { fontFamily: Geist, fontSize: 14px, fontWeight: 400 }
  mono-md: { fontFamily: Geist Mono, fontSize: 14px, fontWeight: 400 }
```

### Authoring rules

- **Tokens are the source of truth.** Components reference tokens (`{colors.primary}`), never raw hex.
- **One primary per viewport.** Stacking primary-green elements is the most common drift; the linter doesn't catch it but PR review must.
- **Mono for money.** Every SOL amount, USD price, score, BPS value, timestamp, and tx signature is `mono-md` or `mono-sm`. Body copy is never mono.
- **Tactile depth.** Cards stay restrained, but every button or button-like control uses the shared skeuomorphic control layer: bevel, top light, crisp contact lip, key/ambient shadow, hover lift, and a depressed active state. Inactive route links stay flat via the route-link treatment; actionable controls use the physical control stack. No ad hoc button styling.
- **Lucide icons only.** No custom illustrations, no Lottie, no PNGs in the UI surface (logos and avatars excepted).

### Tooling

```bash
# Validate the file in CI
bunx @google/design.md lint DESIGN.md

# Check for WCAG AA contrast violations
bunx @google/design.md lint --format json DESIGN.md | jq '.findings[] | select(.severity == "error")'

# Compile to Tailwind v4 theme (committed as .theme/tokens.json)
bunx @google/design.md export --format tailwind DESIGN.md > .theme/tokens.json

# Diff between versions on every PR (regression gate)
bunx @google/design.md diff DESIGN.md.main DESIGN.md
```

The full spec context can be injected into agent prompts via `bunx @google/design.md spec`. We add this to `AGENTS.md` so any agent picking up the repo gets the design system on first read.

### Theming (dark default, light mirror)

GitShipt ships **two themes**: dark (canonical, default) and light (mirrored). Both palettes live in `DESIGN.md` (`colors:` for dark, `colors-light:` for light). Theme is selected via `data-theme="dark"` or `data-theme="light"` on `<html>`, switched with `next-themes`.

**Why both**: dark is the brand and the trader-terminal aesthetic. Light exists for accessibility (some users have vestibular sensitivities to dark UIs), preference parity with the rest of the OS, and projector demos where dark UIs are unreadable. Default to `system` so first-load matches the user's OS preference; fallback is dark.

**Implementation pieces** (4 files):

1. **`apps/web/app/globals.css`** — both palettes as CSS custom properties under `:root` (dark) and `[data-theme="light"]`. Tailwind v4's `@theme inline` routes utility classes through the variables so theme switches are runtime-only with no rebuild. Pattern:

```css
@import "tailwindcss";

:root {
  --bg: #08080c;
  --surface: #101015;
  --primary: #4a9b3d;
  --primary-fg: #f5f5f7;
  --fg: #f5f5f7;
  /* ...rest of dark palette */
}

[data-theme="light"] {
  --bg: #fafafc;
  --surface: #ffffff;
  --primary: #176f3a;
  --primary-fg: #f5f5f7;
  --fg: #0f0f14;
  /* ...rest of light palette */
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-primary: var(--primary);
  --color-fg: var(--fg);
  /* ...rest */
}
```

2. **`apps/web/components/theme-provider.tsx`** — thin wrapper around `next-themes` `ThemeProvider`:

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider(
  props: ComponentProps<typeof NextThemesProvider>,
) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  );
}
```

3. **`apps/web/app/layout.tsx`** — wrap the app, with `suppressHydrationWarning` on `<html>` to prevent flash:

```tsx
import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

4. **`components/theme-toggle.tsx`** — sun/moon Lucide icon button placed in the lower sidebar (next to the user wallet card). Three-state: light, dark, system. Default visible icon reflects the resolved theme (system → whatever the OS is). Cycle order: system → light → dark → system.

```tsx
"use client";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@repo/ui";

const ORDER = ["system", "light", "dark"] as const;
const ICON = { system: Monitor, light: Sun, dark: Moon };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = (theme ?? "system") as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = ICON[current];
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${current}, click to switch to ${next}`}
    >
      <Icon className="size-4" />
    </Button>
  );
}
```

**Component rule**: components never call `useTheme()`. They use Tailwind utility classes (`bg-surface`, `text-fg`, `border-border`) which resolve to the right palette automatically. Only the toggle component reads the theme.

**QA gate**: every screen is screenshot-tested in both themes via Playwright at PR time. Storybook (post-MVP) runs the same component matrix in both palettes side-by-side.

---

## Project page design (the leaderboard view)

The project page (`/r/[org]/[repo]`) is the canonical surface for both public visitors and the project owner's daily view. The layout below is reference-locked and matches the supplied mockup.

### Frame

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR (240px)        │  CONTENT AREA (max 1440px, 32px padding)           │
│                        │  ┌──────────────────────────┬──────────────────┐  │
│ GitShipt by SYMBiEX & dEXploarer     │  │  Project header card     │  Next Payout     │  │
│                        │  │  (avatar, name, repo↗,   │  countdown card  │  │
│ ▸ Overview             │  │   description, stat      │  (12h 34m 56s)   │  │
│ ● Leaderboard          │  │   chips: language,       │  + Cron Active   │  │
│   Payouts              │  │   stars, forks,          │  badge           │  │
│   Repository           │  │   contributors, token)   │                  │  │
│   Token                │  └──────────────────────────┴──────────────────┘  │
│   Settings             │  ┌────────────────────────────────────────────┐   │
│   API Keys             │  │  🏆 Leaderboard               [How Scoring] │   │
│   Docs                 │  │  Top contributors ranked...                 │   │
│                        │  │  ● Updates daily at 00:00 UTC               │   │
│                        │  ├────────────────────────────────────────────┤   │
│                        │  │  Rank │ Contributor │ Score │ % │ Earnings │   │
│                        │  │  🥇 1  │ avatar+name │ 12,456│25%│ 12.45 SOL│   │
│                        │  │       │             │       │   │ $1,532.21│   │
│                        │  │  🥈 2  │ ...                                │   │
│                        │  │  ... (top 10)                               │   │
│                        │  ├────────────────────────────────────────────┤   │
│                        │  │  Total Pool Distributed Daily   49.80 SOL  │   │
│                        │  └────────────────────────────────────────────┘   │
│                        │                                                    │
│ ┌────────────────────┐ │  Right column (380px, gap 24px between cards):    │
│ │ TOKEN INFO CARD    │ │  ┌──────────────────────┐                         │
│ │ GITSHIPT · BAGS Tok │ │  │ Pool Overview        │                         │
│ │ [icon]             │ │  │ Daily Fee Pool       │                         │
│ │ $0.00420 +12.4%    │ │  │ 49.80 SOL [sparkline]│                         │
│ │ 24H Vol $124,532   │ │  │ $6,135.36            │                         │
│ └────────────────────┘ │  │ Source: Trading Fees │                         │
│ ┌────────────────────┐ │  │ Fee Share: 20% [pill]│                         │
│ │ WALLET CARD        │ │  │ [View on Bags.fm ↗]  │                         │
│ │ 8xG7...a1b2        │ │  └──────────────────────┘                         │
│ │ 12.45 SOL  [↗]     │ │  ┌──────────────────────┐                         │
│ └────────────────────┘ │  │ Recent Payouts [All] │                         │
│                        │  │ May 17  48.21 SOL ●  │                         │
│ Powered by BAGS.fm API │  │ May 16  47.32 SOL ●  │                         │
│                        │  │ ... (5 rows)         │                         │
│                        │  └──────────────────────┘                         │
│                        │  ┌──────────────────────┐                         │
│                        │  │ ⚙ System Status      │                         │
│                        │  │ ● Leaderboard Cron   │                         │
│                        │  │ ● Payout Cron        │                         │
│                        │  └──────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components and data sources

| Region                          | Component                            | Data source                                            | Refresh    |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------ | ---------- |
| Sidebar nav                     | `<ProjectSidebar>` with active state | Static + project status                                | On nav     |
| Token info card (lower sidebar) | `<TokenSparkCard>`                   | Bags `lifetime-fees` + DEX price feed (Helius)         | 60s        |
| Wallet card (lower sidebar)     | `<UserWalletCard>`                   | Linked wallet from session, balance via Helius         | On focus   |
| Header card                     | `<ProjectHeader>`                    | `projects` + GitHub repo fields (cached 5min)          | 5min       |
| Next Payout card                | `<NextPayoutCountdown>`              | Cron schedule from `platform_config`                   | 1s tick    |
| Leaderboard card                | `<LeaderboardTable>`                 | `contributors` + latest `snapshots`                    | 5min cache |
| Pool Overview                   | `<PoolOverviewCard>` with sparkline  | Bags `claimable-positions` + 30-day fee history        | 5min       |
| Recent Payouts                  | `<RecentPayoutsFeed>`                | `payouts` joined with `payout_recipients` count        | 1min       |
| System Status                   | `<SystemStatusCard>`                 | Workflow run status from `/api/admin/workflows/health` | 30s        |

### Interaction details

- **Top 3 ranks** show colored medal icons (gold `#FBBF24`, silver `#CBD5E1`, bronze `#D97706`) in the rank column. Ranks 4-10 show the rank number in `mono-md fg-secondary`.
- **Avatar + handle** column: 32px circular GitHub avatar, name in `body-md fg`, `@handle` underneath in `body-sm fg-muted`.
- **Score** column: `mono-md fg`, right-aligned, comma-separated.
- **% of Pool** column: `mono-md fg`, right-aligned.
- **Earnings** column: SOL value in `mono-md fg`, USD subvalue in `mono-sm fg-muted` directly below.
- **Hovering a row**: `surface-elevated` background, no border change.
- **Clicking a row**: navigates to `/u/[username]` in same project context (preserves sidebar).
- **"How Scoring Works"** pill: opens a modal explaining the formula, weights, time decay, and bot exclusion logic. Project admins see additional "Edit weights" button inside.
- **Pool Overview sparkline**: 30 data points (one per day), 2px stroke `chart-1`, no axis labels, tooltip on hover shows date + SOL.
- **Recent Payouts**: 5 most recent successful payouts. Each row clickable to `/dashboard/projects/[id]/payouts/[payoutId]` (admin) or to a Solscan tx for public viewers.
- **System Status**: Each row pulses green dot if last heartbeat <2min ago, yellow if 2-10min, red if >10min.

### Public vs. project-owner views

The same visual layout is shared, with progressive enhancement:

- **Public visitor**: read-only. Sidebar shows only Overview, Leaderboard, Payouts, Repository, Token, Docs. Settings and API Keys are hidden.
- **Linked contributor (own row)**: their row is highlighted with a subtle `primary-soft` left border. A "Claim in Bags" pill appears when the project is live.
- **Project owner (admin)**: sees full sidebar (Settings, API Keys, Repository config). An "Admin actions" dropdown appears in the project header card with: Force Snapshot, Pause Project, Edit Scoring, Transfer Ownership.
- **Super-admin**: same as project owner plus an "Admin: super" pill in the header and access to `/admin/projects/[id]` for full override controls.

---

## Admin & permissions

GitShipt has a multi-tier admin system. The two most important things to internalize:

1. **Project admins (repo owners) get a rich admin console for their own project**, NOT the full platform. They are the day-to-day operators of their leaderboard.
2. **Super-admins (GitShipt platform team) get global override across every project**, plus platform-only surfaces (treasury, fee bounds, kill switches, abuse review).

### Role hierarchy

| Role                | Scope                                                                       | Granted by                                        | MFA required                           |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| `super_admin`       | Global, all projects, all platform config                                   | Bootstrapped, granted by another super_admin only | Yes (TOTP minimum, WebAuthn preferred) |
| `admin`             | Global moderation, no treasury or fee config                                | Granted by super_admin                            | Yes                                    |
| `moderator`         | Read + flag + comment on abuse reports                                      | Granted by admin or super_admin                   | Optional                               |
| `project_owner`     | Own projects only (read+write own resources)                                | Implicit from launching a project; transferable   | Yes for destructive actions            |
| `project_moderator` | Own projects only (read+write specific resources scoped by `project_owner`) | Granted per-project by `project_owner`            | Optional                               |
| `user`              | Public + own profile + claim earnings                                       | Default on signup                                 | No                                     |

Roles are stored on `users.role` (global) and `project_memberships(user_id, project_id, role)` (per-project). Enforced in `proxy.ts` for redirects (perf) AND revalidated inside every protected route/server action (security; CVE-2025-29927).

### Project admin console

Routes live under `/dashboard/projects/[id]/*`. The sidebar shown in the project page mockup is the project admin sidebar.

| Path                                   | Purpose                                                          | Critical actions                                   |
| -------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| `/dashboard/projects/[id]`             | Overview: KPIs, recent activity, alerts                          | None (read-only)                                   |
| `/dashboard/projects/[id]/leaderboard` | Live leaderboard + scoring config                                | Edit scoring weights, exclude users (bots, spam)   |
| `/dashboard/projects/[id]/payouts`     | Payout history + per-payout drill-down                           | Trigger manual payout (gated), retry failed payout |
| `/dashboard/projects/[id]/repository`  | GitHub App install status, branches indexed, sync state          | Force re-index, change tracked branches            |
| `/dashboard/projects/[id]/token`       | Token info, fee config (read-only post-launch), claim history    | View claim history, link Bags.fm dashboard         |
| `/dashboard/projects/[id]/settings`    | Project metadata, payout config, project-level admin permissions | Pause project, transfer ownership, delete project  |
| `/dashboard/projects/[id]/api-keys`    | Project-scoped API keys for webhooks, integrations               | Generate, rotate, revoke                           |
| `/dashboard/projects/[id]/team`        | Add/remove project moderators, scope grants                      | Invite, revoke, change role                        |
| `/dashboard/projects/[id]/docs`        | Per-project public docs (markdown, optional)                     | Edit, publish                                      |

#### What project admins can do

- Edit project metadata (name, description, social links).
- Edit scoring config: window (7-90 days), weights for commits/PRs/reviews/issues/lines, time decay (off/linear/exponential), bot allowlist/blocklist (GitHub usernames).
- Edit payout config: top-N (3-50), tier weights (must sum to 1.0), and rebalance threshold.
- Force a snapshot outside the cron schedule (rate-limited to 1/hour, idempotent).
- Pause project (stops payouts, leaderboard freezes; trading on Bags continues).
- Trigger a manual BPS rebalance for a specific snapshot (requires reason string, MFA reverify, audit log).
- Retry a failed rebalance workflow.
- Add or remove project moderators with scoped permissions.
- Transfer ownership to another GitHub user (target must accept via dashboard within 7 days).
- Delete the project (24-hour cooldown; payouts continue to schedule during the cooldown; final confirm requires typing the repo name).
- Generate project-scoped API keys with custom scopes (`read:leaderboard`, `read:payouts`, `write:webhooks`).
- Review abuse reports filed against contributors of their project (escalate to platform admin).

#### What project admins **cannot** do

- Change the platform fee BPS (set globally by super-admin within bounds).
- Withdraw GitShipt partner revenue or contributor claim balances.
- Re-launch the token or change the on-chain fee share config (immutable post-launch).
- Override the global kill switch.
- Access other projects' data.

### Super-admin console

Routes live under `/admin/*`. Distinct session realm from `/dashboard/*` (separate cookie scope) to enforce the boundary even if a session is hijacked.

| Path                     | Purpose                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `/admin`                 | Ops overview: all queues, all errors, treasury, KPIs, incident feed                                          |
| `/admin/projects`        | Every project on the platform, filterable, bulk actions                                                      |
| `/admin/projects/[id]`   | Per-project god-mode view: same as `/dashboard/projects/[id]/*` PLUS overrides                               |
| `/admin/projects/launch` | Launch a token directly without going through the public wizard (e.g., for partner repos, internal launches) |
| `/admin/users`           | All users, role grants, sybil flags, ban, MFA reset                                                          |
| `/admin/payouts`         | Global payout queue, force-cancel, manual trigger, partial payout, override recipients                       |
| `/admin/snapshots`       | Snapshot history across all projects, hash verification, replay                                              |
| `/admin/treasury`        | Hot wallet balance, top-up from cold treasury (signed admin action), withdrawal flow                         |
| `/admin/fees`            | Platform fee BPS bounds, treasury wallet config, per-project fee overrides                                   |
| `/admin/workflows`       | All workflow runs, step traces, retries, dead letters                                                        |
| `/admin/integrations`    | Bags API health, GitHub App installs, Helius RPC quota, env vars audit                                       |
| `/admin/abuse`           | Reports, sybil flags, plagiarism review, project blacklist                                                   |
| `/admin/audit`           | Append-only audit log, search, export, immutable                                                             |
| `/admin/feature-flags`   | Per-feature gates (per-user, per-project, per-cohort)                                                        |
| `/admin/maintenance`     | Global kill switch, read-only mode, banner messaging                                                         |
| `/admin/db`              | Read-only SQL sandbox (logged, scoped to non-PII tables)                                                     |

#### Super-admin can also

- Launch new tokens directly (skip the public wizard, set custom fee shares, partner configurations).
- Override any project setting (fee BPS, scoring config, payout config, status).
- Force-pause or force-kill any project globally.
- Resnapshot any project from any historical date (re-runs scoring formula deterministically).
- Approve / reject project launches if the approval gate flag is on.
- Manually claim GitShipt partner fees (requires reason + MFA + cosign).
- Adjust platform fee BPS (within the 0-2000 BPS hard cap enforced at DB and contract layer).
- Rotate or fund the server-side manager signer after an explicit security review.
- Toggle feature flags globally or per-cohort.
- Access the audit log unfiltered.

#### Critical action gates (every destructive admin action)

1. **Reason string required** (min 20 chars, stored in audit log).
2. **MFA reverify within last 5 minutes** (otherwise prompt for TOTP).
3. **Confirmation modal** with the action name, target, and a typed-in confirmation (project name, user handle, etc.).
4. **Audit log entry written before the action executes**, with: actor, action, target, reason, IP, user agent, timestamp.
5. **Notification email** to the affected project owner (if applicable) within 5 minutes.
6. **Reversibility check**: irreversible actions (delete, force-payout, withdraw) require a second admin to co-sign within 1 hour, otherwise the request expires.

### Console design

The admin console **uses the same DESIGN.md tokens and component library** as the rest of the product. The visual difference between project admin and super-admin is signaled by:

- **Sidebar accent**: project admin sidebar matches the standard green. Super-admin sidebar has a subtle red `border-strong` left edge in the brand mark area, signaling elevated authority.
- **Header pill**: project pages show a `[Admin]` pill in `primary-soft`. Super-admin pages show a `[Admin: SUPER]` pill in `danger-soft danger`. This is the most reliable visual cue and appears on every admin route.
- **Destructive controls**: always use `button-danger` (red), never primary green. Confirmation modals use `surface-overlay` background with a red `border-strong` and a red icon header.
- **Tables in admin views**: same component, but financial-impact columns (treasury balance, fees claimed, refunds) are right-aligned `mono-md` and color-coded green (positive) or red (negative).

### Granular permission matrix (for `lib/auth/permissions.ts`)

```ts
// Sample permissions, full set in code
const PERMISSIONS = {
  "project.read": [
    "user",
    "project_moderator",
    "project_owner",
    "admin",
    "super_admin",
  ],
  "project.update": ["project_owner", "admin", "super_admin"],
  "project.delete": ["project_owner", "super_admin"], // admin cannot delete
  "project.transfer": ["project_owner", "super_admin"],
  "project.pause": ["project_owner", "admin", "super_admin"],
  "project.kill": ["super_admin"], // platform-level only
  "scoring.read": [
    "user",
    "project_moderator",
    "project_owner",
    "admin",
    "super_admin",
  ],
  "scoring.update": ["project_owner", "super_admin"],
  "payouts.read": [
    "project_owner",
    "project_moderator",
    "admin",
    "super_admin",
  ],
  "payouts.trigger": ["project_owner", "super_admin"],
  "payouts.cancel": ["super_admin"],
  "team.invite": ["project_owner", "super_admin"],
  "team.revoke": ["project_owner", "super_admin"],
  "platform.fees.update": ["super_admin"],
  "platform.treasury.topup": ["super_admin"],
  "platform.kill_switch": ["super_admin"],
  "admin.users.role.grant": ["super_admin"],
  "admin.audit.read": ["admin", "super_admin"],
};
```

Enforced via a `requirePermission(permission, { projectId? })` helper in every server action and route handler. Project-scoped permissions check both the global role AND the `project_memberships` row.

---

## File tree

```
gitshipt/
├── DESIGN.md                         # Google Labs DESIGN.md spec, source of truth for visual identity
├── AGENTS.md                         # Agent context: links to DESIGN.md spec + project conventions
├── .theme/tokens.json                # Generated from apps/web/app/globals.css
├── apps/
│   └── web/                          # Deployable Next.js 16.2 app
│       ├── app/                      # App Router routes and route handlers
│       ├── components/               # App-owned chrome/features
│       ├── lib/                      # auth, Bags, GitHub, Solana, scoring, cache, audit
│       ├── db/                       # Drizzle schema, migrations, clients
│       ├── workflows/                # Vercel Workflows and step helpers
│       ├── public/
│       ├── proxy.ts                  # Redirects only, NEVER sole auth gate
│       ├── next.config.ts
│       ├── drizzle.config.ts
│       └── package.json              # @repo/web
├── packages/
│   ├── ui/                           # @repo/ui shadcn-style primitives
│   ├── lib/                          # @repo/lib pure utilities
│   └── shared/                       # @repo/shared schemas, constants, API types
├── vercel.json                       # Vercel deploy, Fluid Compute, functions, cron
├── package.json
├── bun.lock
├── tsconfig.base.json
└── tsconfig.json
```

**Notes**:

- `DESIGN.md` is the **single source of truth** for the visual system. `.theme/tokens.json` is generated from it in CI; never edited by hand.
- `AGENTS.md` is the agent-context companion: it tells Claude Code, Cursor, and Copilot to read DESIGN.md first, lists project conventions, and references key files.
- `apps/web/proxy.ts` (formerly `middleware.ts` in Next.js 15-) handles redirects and edge optimizations only. **Auth is revalidated inside every protected route handler and Server Component** to mitigate CVE-2025-29927.
- Bun workspaces keep one deployable Next.js app plus small shared packages. There is still a single deploy target; no separate worker app. Workflows live alongside the web app and ship in the same deploy.

Example `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "bunVersion": "1.x",
  "installCommand": "bun install --frozen-lockfile",
  "buildCommand": "bun run build",
  "devCommand": "bun run dev -- --port $PORT",
  "outputDirectory": "apps/web/.next",
  "fluid": true,
  "regions": ["iad1"],
  "crons": [
    { "path": "/api/cron/index-github", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/snapshot", "schedule": "0 0 * * *" },
    { "path": "/api/cron/rebalance-bps", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/claim-partner-fees", "schedule": "30 0 * * *" },
    { "path": "/api/cron/health", "schedule": "* * * * *" },
    { "path": "/api/cron/publish-kpis", "schedule": "* * * * *" }
  ]
}
```

Each cron route is a thin handler that verifies `CRON_SECRET` and triggers the corresponding workflow.

---

## Vercel deployment plan

**Single Vercel project. No external compute.**

### Marketplace integrations (one-click from Vercel dashboard)

- Neon Postgres
- Upstash Redis
- Sentry (optional, error tracking)

### Plan requirement

- **Vercel Pro** minimum. Hobby cron is daily-only with ±60min imprecision. Pro unlocks `*/15 * * * *` schedules and tight timing required for the 00:00 UTC snapshot/payout pipeline. Pro also gets 14-min Fluid Compute duration.

### Environment variables

Configured in Vercel dashboard, scoped per environment (Production / Preview / Development). All marked `Sensitive` where applicable.

```
# Database (auto-injected by the Neon Vercel integration)
DATABASE_URL
DATABASE_URL_UNPOOLED
PGHOST / PGUSER / PGPASSWORD / PGDATABASE

# Cache (auto-injected by Upstash)
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN

# Auth
BETTER_AUTH_SECRET
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_WEBHOOK_SECRET

# Bags.fm
BAGS_API_KEY
BAGS_API_BASE_URL
BAGS_WEBHOOK_SECRET
BAGS_PARTNER_WALLET=HXs58Qa6YtgJfWVkQVnpFmw6WoEdFEL4LLD1ArZjMvTH
BAGS_REF_CODE=symbiex
BAGS_PARTNER_CONFIG_KEY
BAGS_CONFIG_TYPE
BAGS_ALLOW_PROD_LAUNCH=false
ALLOW_STUBS_IN_PROD=false

# Solana
HELIUS_RPC_URL
SOLANA_PAYOUT_KEYPAIR     # base58 encoded, marked Sensitive
SOLANA_TREASURY_ADDRESS     # optional cold treasury/admin display address

# Cron
CRON_SECRET               # 32+ random chars, marked Sensitive

# App
NEXT_PUBLIC_APP_URL=https://gitshipt.com
PLATFORM_FEE_BPS_DEFAULT=0
ADMIN_EMAIL_ALLOWLIST
```

### Cron security pattern

Every `/api/cron/*` handler validates `Authorization: Bearer ${CRON_SECRET}` before triggering its workflow. Vercel auto-injects this header on cron-triggered requests.

```ts
// app/api/cron/rebalance/route.ts
import { triggerBpsRebalanceWorkflow } from "@/workflows/rebalanceBps";

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  await triggerBpsRebalanceWorkflow();
  return Response.json({ ok: true });
}
```

### Observability

- **Workflows dashboard** (Vercel) for run-by-run inspection, step traces, retries
- **Vercel Observability** for request logs, function metrics, errors
- **Sentry** for unhandled exceptions in user-facing routes
- Custom `/admin/workflows` page in app for product-level metrics on top of Vercel's data

### Local dev

- `vercel dev` for the app
- Workflow Local World runs the same workflow code offline against a local SQLite event log
- `vercel env pull` syncs production env to `.env.local`

---

## Build plan (3-day sprint)

### Day 1 (April 25)

- Bun workspace monorepo scaffolded with one Next.js 16.2 deployable app, deployed to Vercel (Pro plan, Fluid Compute on)
- **DESIGN.md authored** at repo root with both `colors:` (dark) and `colors-light:` (light) palettes, validated with `@google/design.md lint`, exported to `.theme/tokens.json`
- shadcn/ui CLI run with the generated theme
- `next-themes` wired: `theme-provider.tsx`, `theme-toggle.tsx`, `globals.css` with `@theme inline` dual-palette pattern, `suppressHydrationWarning` on root layout
- Neon Postgres provisioned via Vercel Marketplace, Drizzle schema + first migration applied
- Upstash Redis added via Vercel Marketplace
- All env vars created with `Sensitive` flag
- better-auth + GitHub OAuth working end-to-end
- SIWS verification flow proven against devnet
- Bags client wrapper stubbed against Bags staging
- 15min sync with Teddy to confirm Bags fee distribution endpoints
- First trivial workflow (`healthPulse`) deployed and visible in Workflows dashboard
- `proxy.ts` set up for redirects only; auth revalidation pattern in route handlers established

### Day 2 (April 26)

- Launch wizard: form → Bags API → token live
- GitHub App installed on test org, `indexGithubDeltas` workflow pulling commits + merged PRs
- `computeLeaderboard` workflow + **public project page UI matching the supplied mockup**
- Project admin console: Overview, Leaderboard, Settings tabs (Payouts and others stubbed)
- Vercel Cron entries for all schedules in `vercel.json`
- Bags claim handoff MVP

### Day 3 (April 27)

- `takeSnapshot` + `rebalanceBps` workflows end-to-end on devnet
- `rebalanceBps` + `claimPartnerFees` workflows
- **Super-admin console**: Ops dashboard, kill switch, fee config, audit log, payout retry, treasury (read-only), workflow run inspector
- Permission matrix and `requirePermission` helper enforced across all routes
- Security pass (CSP, HMAC, idempotency, rate limits, CRON_SECRET, sensitive env audit)
- DESIGN.md final pass, contrast lint clean, Tailwind theme regenerated
- Smoke test full Bags rebalance and claim handoff pipeline against devnet

### April 28 morning

- Launch GitShipt's own token live
- Push final commits, run first Bags rebalance on stage
- Demo recording + submission

---

## Risks and mitigations

| Risk                             | Mitigation                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bags API undocumented surface    | Day 1 sync with Teddy; stub-and-mock wrapper to unblock work                                                |
| GitHub rate limits               | Use GitHub App (15k req/hr), aggressive caching, webhook-first                                              |
| Sybil farming on small repos     | Min repo age (30d) + min star count (10) at launch, configurable                                            |
| Manager signer compromise        | Dedicated manager signer, least-privilege delegation, rotation playbook, no contributor fee custody         |
| Legal exposure                   | Pre-mainnet counsel review on US fee distribution to anonymous wallets                                      |
| Snapshot drift / non-determinism | Lock formula_version per snapshot, store full inputs, replayable                                            |
| Demo failure on stage            | Pre-record fallback video, run demo on devnet with mainnet UI                                               |
| Vercel function duration cap     | Step-based workflows with idempotent Bags updates and bounded fan-out per project                           |
| Vercel cron timing imprecision   | Pro plan required for sub-daily and precise timing                                                          |
| Vendor lock to Vercel Workflows  | Workflow SDK is open-source and portable; Postgres-backed self-host adapter exists if migration ever needed |

---

## Success metrics (post-hackathon)

- 10 live projects in week 1
- $5k cumulative Bags-routed fees in month 1
- 50% contributor wallet link rate
- < 1% payout failure rate after retries
- Zero unauthorized admin actions (audit log clean)
