# SPEC.md — frozen product invariants

This file is the contract. Every feature, refactor, or audit must respect these
invariants. If something is not listed here as in-scope, it is out-of-scope by
default — surface it as a question rather than building it.

`DESIGN.md` and `gitshipt-prd.md` are the authoritative long-form docs. This
file is the short, hard list of what is true and what is forbidden, written
specifically because past sessions invented adjacent features that contradicted
the product model.

## Product invariants (do not violate)

- **SOL-only payouts.** No SPL token logic, no multi-token branches, no
  token-type abstractions. Payouts are SOL via `@solana/web3.js@^1.98.x`.
- **All launches are community launches.** There is exactly one launch type.
- **Bags handles Incorporation, custody, and contributor claims.** We do not
  re-implement, mirror, or wrap any of it. Contributors claim fees through
  Bags' GitHub-OAuth UI, signing transactions with their own wallet. GitShipt
  never holds, dispatches, or routes contributor SOL.
- **Bags-native payouts via manager-keypair BPS rebalance.** GitShipt is the
  on-chain manager (delegated by Bags admin via `update_fee_config_manager`
  immediately after launch). Manager authority is bounded to BPS rebalance
  within the existing claimer set — never custody, never dispatch SOL to
  recipients, never replace claimer pubkeys (impossible per `fee-share-v2`
  IDL). The product flow is: GitHub activity → ranked contributors → daily
  snapshot → manager BPS rebalance.
- **Cadence is per-project, configurable.** 24h initial → 3d second → 3/5/7d
  configurable thereafter. Stored in `payout_schedules` per project. The
  leaderboard UI updates daily regardless; the on-chain rebalance follows
  the configured cadence.
- **No grace windows. No off-chain claim windows. No off-chain custody.**
  Contributors who haven't onboarded to Bags at launch time are skipped from
  the claimer set, not held in escrow. Project owners are responsible for
  outreach. There is exactly one place SOL can be claimed: through Bags
  itself.
- **Contributor wallet linking is on Bags, not on GitShipt.** GitShipt never
  asks contributors for wallet addresses, never runs SIWS for contributor
  identity, never custodies a "claimable balance" for them. The only wallet
  identity GitShipt holds is project-owner attestation for launch-time
  signing.
- **Stub-safe by default.** External clients (Bags, Helius, payout keypair)
  must keep deterministic stub fallbacks based on env-var presence. Never
  invent secrets to make a flow "work" — stop and name the missing env var.
- **Step idempotency is manual.** Vercel Workflows do not auto-dedupe step
  side effects. Pass `getStepMetadata().stepId` as the idempotency key for
  every external API call.
- **`proxy.ts` is for redirects + CSP nonces only.** Auth must be revalidated
  in-process inside every protected Server Component, Server Action, and
  route handler (CVE-2025-29927).
- **No raw hex in components.** Use design tokens (`bg-surface`, `text-fg`,
  `text-rank-gold`, etc.). Both palettes resolve via CSS variables.
- **Numeric values use mono.** SOL, USD, BPS, scores, timestamps, tx
  signatures: `text-mono-md` / `text-mono-sm`. Body copy is never mono.
- **TypeScript strict, `noUncheckedIndexedAccess` on.** No `any` outside
  justified, commented type holes.
- **Mutations follow the same checklist** every time: revalidate session →
  `requirePermission` → Zod-validate input → respect `Idempotency-Key` →
  audit log on success → revalidate cache tags.
- **Two-super-admin cosign for irreversible admin actions.** Single approval
  is not sufficient for destructive operations.

## Explicit non-goals (do not build)

- An off-chain SOL dispatch loop that sends fees from a GitShipt-controlled
  wallet to contributor wallets. (Was the original v1.0 architecture, deleted
  in the v1.1 Bags-native migration. Bags' on-chain vaults custody fees;
  contributors claim them directly via Bags' UI.)
- An `escrow_holdings` table or any GitShipt-side custody of contributor
  funds. (Same. Deleted in v1.1.)
- A SIWS-based contributor wallet-linking flow on GitShipt. Contributors link
  GitHub to Bags directly through Bags' OAuth. (Same. Deleted in v1.1.)
- A `processClaim` workflow or `/api/claims/*` route on GitShipt's side.
  (Same. Deleted in v1.1.)
- Daily token re-launches per project, or any "rotate token" model. Bags
  `fee-share-v2` makes claimer pubkeys immutable post-finalize; we live within
  that constraint by rebalancing BPS rather than rotating claimers.
- Pre-allocating fee-share slots to GitHub handles that haven't onboarded to
  Bags. The Bags resolve endpoint 404s for unlinked handles and the wallet
  PDA is custodial-keyed, not derivable. Unlinked contributors are skipped at
  launch, not reserved.
- A 7-day or N-day grace/claim window for contributors who haven't linked a
  wallet. (Specifically forbidden — invented in a past session, reverted.
  Subsumed by the no-off-chain-custody invariant above; listed explicitly to
  prevent regression.)
- A 14-day or N-day migration window for existing projects to install
  shipshape. (Same principle. v0 → v1 promotion happens in one cut-over via
  a single SQL backfill per shipshape design §11; no grace.)
- A custom Incorporation feature, signing flow, or KYC layer. Bags owns this.
- SPL token support, "future-proofing" for non-SOL payouts, or generic
  multi-asset abstractions.
- Re-exporting / bridging Bags fee-claim functionality through our own
  abstractions. Call `sdk.fee.*` directly from the workflow step.
- A second auth realm or "lite" auth for any public action. There are exactly
  two session realms: standard user and super-admin.
- A custom CSP layer outside `proxy.ts`. The proxy mints per-request nonces;
  do not introduce a parallel static policy.
- A theme switcher hook in components. Only `theme-toggle.tsx` may call
  `useTheme()`.

## Acknowledged limitations — accepted, not defended

These attacks exist on the contribution-economy spine. They are not solvable
algorithmically without cross-platform identity / KYC / human-element
verification. v1 mitigates with the social layer (penalty system, optional
community verification, operator-share cap, audit log, peer override) but
does not pretend to defeat them. The 80/15/5 rule: algorithm handles 80%,
maintainers handle 15% via `/gitshipt flag` + `/gitshipt ban`, the remaining
5% is the human-element cost of doing business.

- **Maintainer-author collusion via alt accounts.** A maintainer with an
  alt can author + self-approve + self-merge. Mitigated, not eliminated.
- **Cross-repo single-human arbitrage.** One human admin of N GitShipt
  repos scales the per-project cap by N. v2 platform-level cap planned.
- **Owners writing biased CI rules to flag honest contributors.**
  Mitigated by mandatory `evidenceUrl`, peer override, and the
  contributor's right to walk.
- **Community channels GitShipt does not run.** Per shipshape §6.7,
  projects are advised to link Discord/Telegram/X for voice/video/stream
  verification. GitShipt does not host, moderate, or attest to anything
  that happens there.
- **Substance-checking AI reviews.** Length+anchor+suggestion-density is
  gameable by well-prompted bots. Real substance check (do comments
  reference real diff symbols, do suggestions compile) needs LLM at
  review time. v2.
- **Org-level coordination beyond namespace + default-config inheritance.**
  v1 ships orgs as a namespace with shared defaults and read-only
  aggregated dashboards. Org-level tokens with cross-repo fee-pool
  weighting, org-level shipshape, org-wide slash commands, and
  auto-sync of org defaults to existing projects all defer to v2 — they
  need their own design pass. Per-repo coordination is the v1 contract.

## Boundaries that need confirmation before crossing

If the user asks for something in this list, confirm scope and constraints
before writing code. These are areas where past sessions drifted.

- New Vercel Workflow files (`apps/web/workflows/*.ts`).
- New Drizzle schema files or migration changes.
- New top-level route realms under `apps/web/app/` (currently `(public)`,
  `(auth)`, `dashboard/`, `admin/`, `r/[org]/[repo]`, `embed/`, `api/`).
- New external client (anything that hits a third-party API).
- Bundler / runtime changes (`next.config.ts`, `bun.lock` deps, Cloudflare
  Workers compatibility, edge runtime adoption).
- Auth flow changes (better-auth plugins, SIWS, TOTP, cosign).

## How agents should use this file

1. **Read SPEC.md before editing.** The full file fits in context; there is
   no excuse to skip it.
2. **If a task implies building something not listed in invariants or
   confirmed-scope work, stop and ask.** Do not infer scope from adjacent
   features.
3. **When reviewing a diff (own or another agent's), reject anything that
   contradicts an invariant or a non-goal**, even if it looks well-built.
   The fastest path forward is to delete invented scope.
4. **Updates to SPEC.md require explicit user approval.** It is the contract;
   do not edit it as a side effect of feature work.
