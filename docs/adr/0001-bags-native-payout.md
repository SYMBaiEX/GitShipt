# ADR 0001 — Bags-native payout architecture

**Status:** Accepted
**Date:** 2026-05-06
**Supersedes:** v1.0 off-chain dispatch + escrow architecture
**Implementation plan:** [docs/architecture/bags-native/PLAN.md](../architecture/bags-native/PLAN.md)
**Research backing:** [docs/architecture/bags-native/RESEARCH.md](../architecture/bags-native/RESEARCH.md)

---

## Context

GitShipt v1.0 shipped with an off-chain payout architecture: GitShipt's platform
keypair claimed Bags fees daily, distributed SOL to each ranked contributor's
linked wallet via a per-recipient dispatch loop, and held funds in an
`escrow_holdings` table for contributors who hadn't linked a wallet (with a
30-day expiry flagged for admin review).

This architecture was built under the assumption that Bags' fee-share program
supported some form of recipient rotation — that we could update the on-chain
claimer set as the contributor leaderboard evolved. Direct inspection of the
`fee-share-v2` IDL (program id `FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK`)
proves this is false:

- `UpdateFeeConfigParameters` contains only `bps`, `from_idx`, `to_idx`,
  `finalize_update` — there is no `claimers` field. Claimer pubkeys are
  immutable.
- Error codes `6016 CannotRemoveClaimerWithFees` and
  `6017 CannotChangeClaimerIndexWithFees` enforce slot stability at the
  program level.
- `is_init_finalized=0` blocks claim and update ixs, so "stay in extend phase
  forever" is not a viable workaround.
- No `close_fee_config` instruction exists; the config PDA lives for the
  lifetime of the token mint.

The result is that the v1.0 architecture custodies funds, runs a dispatch
loop, and maintains an escrow surface to solve a problem (post-launch
contributor evolution) that the on-chain primitive does not actually require
us to solve via custody. The v1.0 design is **structurally redundant** with
what Bags itself does, and adds custody risk + reconciliation complexity
without product benefit.

## Decision

Migrate to a **Bags-native payout architecture**:

1. **GitShipt is the on-chain manager** of each project's fee-share config,
   delegated by Bags admin via `update_fee_config_manager` immediately after
   launch. Manager authority is bounded to BPS rebalancing within the
   existing claimer set.

2. **Daily snapshot → manager-keypair BPS rebalance** on a per-project
   configurable cadence (24h initial → 3d second → 3/5/7d configurable
   thereafter). The on-chain `update_fee_config` instruction with the new
   BPS vector is the only state change we make.

3. **Contributors claim directly through Bags' GitHub-OAuth UI.** GitShipt
   never holds, routes, or dispatches contributor SOL. Real-time per-claim
   attribution comes from subscribing to `BagsFeeShareUserClaimV2Event` via
   Helius enhanced webhooks.

4. **GitShipt revenue rides on Bags' partner config** (already wired via
   `BAGS_PARTNER_*`), structurally separate from the 10,000 bps contributor
   split.

5. **Contributors not on Bags at launch time are skipped from the claimer
   set, not held in escrow.** Project owner is responsible for outreach
   before launch.

## Consequences

### What goes away (Phase 6 deletion target)

- `escrow_holdings` table + `expireEscrow` workflow + `expire-escrow` cron
- `processClaim` workflow + `/api/claims/escrow` + `/api/claims/link` routes
- `executePayout` dispatch loop (`claimFeesStep` + per-recipient `dispatchStep`)
- `payout` cron — replaced by `rebalance-bps` cron
- SIWS contributor wallet-linking flow (`/api/wallets/nonce`,
  `/api/wallets/verify`, `lib/auth/siws.ts` if unused elsewhere,
  `SignInWithSolanaFlow.tsx`, dashboard wallets page,
  `ClaimEscrowButton.tsx`)
- Polling-based fund reconciliation (replaced by event-driven indexing of
  `bags_claim_events`)
- ~70-80% of payout-related code, by line count

### What's added (Phases 2-4)

- Manager keypair (`SOLANA_MANAGER_KEYPAIR`, separate from
  `SOLANA_PAYOUT_KEYPAIR` which is deleted) with BPS-rebalance-only authority
- `rebalanceBps` workflow + `/api/cron/rebalance-bps` cron
- `bags_fee_share_configs`, `bags_claimer_slots`, `bags_claim_events`,
  `payout_schedules` tables
- Helius enhanced webhook handler at `/api/webhooks/helius/bags-events`
- Polling fallback `ingestBagsEvents` workflow + `/api/cron/ingest-bags-events`
- Bulk handle resolution via `state.getLaunchWalletV2Bulk` in launch wizard
- Per-contributor Bags-resolution status badges in launch + leaderboard UI
- Cadence selector (24h | 3d | 5d | 7d) in launch wizard + project settings
- Claim event feed component for contributor dashboards

### Constraints we now accept

- **The contributor set is fixed at launch** for each token. Contributors who
  emerge after launch can never earn from that token. Their only path is for
  the project to launch a new token. This matches how token launches actually
  work in practice (community at the moment of launch is the community that
  benefits).
- **Maximum 100 contributor slots per token** (Bags-imposed). Default cap is
  50 with override-to-100 as an advanced setting.
- **Contributors must onboard to Bags before launch** to be included.
  GitShipt provides outreach helpers but does not pre-allocate slots.
- **Bags HTTP API rate limit (1000 req/hr/IP)** must be budgeted for during
  bulk launch operations.
- **Helius enhanced webhooks may drop events** — polling fallback every 5min
  catches drift.

### Security posture changes (mostly improvements)

- **No SOL custody.** The blast radius of any future GitShipt key compromise
  is bounded to "manipulate BPS within an existing claimer set." Cannot drain
  funds. Cannot reassign claimers. Contributor accrued fees cannot be touched
  by a manager-key compromise.
- **Manager keypair is in scope of the existing Sensitive-flagged env vars
  policy.** No new secret-handling patterns introduced.
- **Off-chain reconciliation surface area drops by ~80%.** Drift between
  "claimed" and "dispatched" can no longer exist because we don't dispatch.
- **`escrow_holdings` data migration risk** during Phase 5 cutover — mitigated
  by 14-day outreach window and per-project consent flow.

## Open decisions resolved (defaults from MIGRATION-PLAN §5)

| ID | Question | Decision |
| --- | --- | --- |
| D1 | `wallets` table fate | Keep for project-owner attestation; drop contributor-linking columns in Phase 6 |
| D2 | Cutover UX | Project-dashboard banner + click-through "Migrate to v2" button. No auto-migrate. |
| D3 | Existing escrow_holdings | Drain to contributor wallets via existing `processClaim` flow before cutover, with 14-day outreach window. Project owners run their own outreach. |
| D4 | Manager keypair custody | Single shared `SOLANA_MANAGER_KEYPAIR` for v1.1. Per-project HD-derived keys deferred to v1.2. (Authority is BPS-only; blast radius is already bounded.) |
| D5 | Fee preset config | Hard-code `Default` preset in v1.1. Expose 4-preset selector in v1.2 settings. |
| D6 | Claimer count cap | Default 50 with override-up-to-100 as an advanced launch wizard setting. |
| D7 | GitShipt partner cut default | 500 bps (5%) default, launcher can override 0-1000 bps at launch. |

Any of these can be revisited; they are recorded here so future reviewers can
see what was deliberate vs. what was an unconsidered default.

## Rejected alternatives

### A. Per-period token launches
Each cadence period (24h/3d/etc.) spawns a new token with that period's
top-N contributors as fixed claimers at launch. Old tokens stay live forever
for historical claims.

**Rejected** because it creates an unbounded number of low-liquidity tokens
per project, fragments the trading base, and offers no benefit over the
single-token + BPS-rebalance model. The "rotation" the user wants is
fundamentally about *weighting*, not *membership*; weighting is what BPS
already does.

### B. Hybrid escrow buffer
Keep `escrow_holdings` as a "buffer" between Bags rotations — contributors
who fall out of the claimer set get their accrued moved to escrow, then
drained on wallet link.

**Rejected** because half-custody is worse than full-custody: same regulatory
surface, same code complexity, just with weirder semantics. If we're going to
custody at all, the on-chain `force_claim_user_to_vault` (which writes to a
per-user `UserFeeVault` PDA owned by the contributor's pubkey) is the
correct primitive — but admin-only ixs (signed by Bags) are not callable by
integrators. So the on-chain vault path is closed to us, and the off-chain
buffer is strictly worse than just skipping unlinked contributors.

### C. Daily claimer rotation via "extend forever"
Use `extend_created_fee_config` with `finalize_init=false` indefinitely,
adding new contributor slots whenever the leaderboard changes.

**Rejected** because `is_init_finalized=0` blocks claim and update ixs per
the IDL field doc. There is no "extend phase that also accepts claims" — the
two are mutually exclusive program states. The token cannot go operational
without being finalized, and finalization closes the extend door.

## References

- IDL: `node_modules/@bagsfm/bags-sdk/dist/idl/fee-share-v2/idl.json`
- Inspector script: [scripts/inspect-bags-program.ts](../../scripts/inspect-bags-program.ts)
  (`bun run scripts/inspect-bags-program.ts inspect-program`)
- Bags docs: https://docs.bags.fm/
  - [Update fee-share config](https://docs.bags.fm/api-reference/create-fee-share-admin-update-config.md)
  - [Resolve fee share wallet](https://docs.bags.fm/api-reference/get-fee-share-wallet)
  - [Partner config](https://docs.bags.fm/api-reference/create-partner-configuration.md)
  - [Claim flow](https://docs.bags.fm/how-to-guides/claim-fees)
- Bags GitHub: https://github.com/bagsfm
  - [`bagsfm/bags-cli`](https://github.com/bagsfm/bags-cli) — reference integration
  - [`bagsfm/bags-idl`](https://github.com/bagsfm/bags-idl) — IDL only (Rust source not public)

## Sign-off

User-approved 2026-05-06 with all 7 defaults accepted. Implementation
proceeds per [PLAN.md](../architecture/bags-native/PLAN.md) phase order.
