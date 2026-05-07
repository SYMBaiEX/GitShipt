# ADR 0001 — Bags-native payout architecture

**Status:** Accepted
**Date:** 2026-05-07
**Research backing:** [docs/architecture/bags-native/RESEARCH.md](../architecture/bags-native/RESEARCH.md)

---

## Context

GitShipt's payout flow has to evolve a project's contributor leaderboard
into on-chain fee-share weights. Earlier scaffolding assumed Bags'
fee-share program supported some form of recipient rotation — that we
could update the on-chain claimer set as the contributor leaderboard
evolved. Direct inspection of the `fee-share-v2` IDL (program id
`FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK`) proves this is false:

- `UpdateFeeConfigParameters` contains only `bps`, `from_idx`, `to_idx`,
  `finalize_update` — there is no `claimers` field. Claimer pubkeys are
  immutable.
- Error codes `6016 CannotRemoveClaimerWithFees` and
  `6017 CannotChangeClaimerIndexWithFees` enforce slot stability at the
  program level.
- `is_init_finalized=0` blocks claim and update ixs, so "stay in extend
  phase forever" is not a viable workaround.
- No `close_fee_config` instruction exists; the config PDA lives for the
  lifetime of the token mint.

Any architecture that custodies funds, runs a dispatch loop, or maintains
an escrow surface to solve "post-launch contributor evolution" is
**structurally redundant** with what Bags itself does, and adds custody
risk + reconciliation complexity without product benefit.

## Decision

GitShipt is a **Bags-native payout architecture**:

1. **GitShipt holds the on-chain manager role** of each project's
   fee-share config — strictly distinct from the admin role. The launching
   wallet (project owner) remains admin throughout the token's lifetime
   and delegates the manager role to GitShipt's `SOLANA_MANAGER_KEYPAIR`
   immediately after launch via `update_fee_config_manager`. Manager
   authority is structurally bounded by the IDL: it can call
   `manager_update_fee_config` (BPS rebalance),
   `manager_transfer_fee_config` (rotate the manager keypair), and
   `manager_waive_fee_config` (return the role to the admin), and
   **nothing else**. It cannot drain funds, replace claimer pubkeys, set
   the partner config, or reassign admin.

   Bags' HTTP API does not expose `update_fee_config_manager` — only the
   admin-equivalents are wrapped in `bags-cli` and the public REST
   endpoints. GitShipt builds these manager-role instructions directly via
   Anchor in `apps/web/lib/bags/program-client.ts`, using the IDL bundled
   with `@bagsfm/bags-sdk`. Principle of least privilege required this —
   if the manager keypair is ever compromised, the project owner (admin)
   revokes it via a single `update_fee_config_manager` call to a fresh
   keypair, and the worst case during the compromise window is BPS
   manipulation, never theft.

2. **Daily snapshot → manager-keypair BPS rebalance** on a per-project
   configurable cadence (24h initial → 3d second → 3/5/7d configurable
   thereafter). The on-chain `manager_update_fee_config` instruction with
   the new BPS vector is the only state change we make.

3. **Contributors claim directly through Bags' GitHub-OAuth UI.** GitShipt
   never holds, routes, or dispatches contributor SOL. Real-time per-claim
   attribution comes from subscribing to `BagsFeeShareUserClaimV2Event`
   via Helius enhanced webhooks.

4. **GitShipt revenue rides on Bags' partner config** (wired via
   `BAGS_PARTNER_*`), structurally separate from the 10,000 bps
   contributor split.

5. **Contributors not on Bags at launch time are skipped from the claimer
   set, not held in escrow.** Project owner is responsible for outreach
   before launch.

## Architecture map

| Concern | Location |
| --- | --- |
| On-chain program client (manager ixs, PDAs) | `apps/web/lib/bags/program-client.ts` |
| Bulk handle → wallet resolution (Bags HTTP) | `bags.resolveLaunchWalletsBulk` in `apps/web/lib/bags/client.ts` |
| Anchor event parser (claim events) | `apps/web/lib/bags/program-events.ts` |
| Manager keypair signer | `apps/web/lib/solana/manager-signer.ts` |
| Launch persistence + delegation tx | `apps/web/lib/bags/launch-integration.ts` |
| BPS allocation logic (pure) | `apps/web/lib/payouts/bps-plan.ts` |
| Cadence-driven rebalance workflow | `apps/web/workflows/rebalanceBps.ts` |
| Cadence cron handler | `apps/web/app/api/cron/rebalance-bps/route.ts` |
| Helius webhook handler | `apps/web/app/api/webhooks/helius/bags-events/route.ts` |
| Schema | `apps/web/db/schema/{bags-fee-share,bags-claim-events,payout-schedules}.ts` |
| Launch wizard cadence selector | `apps/web/app/(public)/launch/_components/CadenceSelector.tsx` |
| Post-launch delegation step UI | `apps/web/app/(public)/launch/_components/ManagerDelegationStep.tsx` |

## Constraints we accept

- **The contributor set is fixed at launch** for each token. Contributors
  who emerge after launch can never earn from that token. Their only path
  is for the project to launch a new token. This matches how token
  launches actually work in practice — the community at the moment of
  launch is the community that benefits.
- **Maximum 100 contributor slots per token** (Bags-imposed). Default cap
  is 50 with override-to-100 as an advanced launch setting.
- **Contributors must onboard to Bags before launch** to be included in
  the claimer set. GitShipt provides outreach helpers but does not
  pre-allocate slots.
- **Bags HTTP API rate limit (1000 req/hr/IP)** must be budgeted for
  during bulk launch operations.
- **Helius enhanced webhooks may drop events** — periodic polling can
  catch drift if it becomes a problem.

## Security posture

- **No SOL custody.** The blast radius of any GitShipt key compromise is
  bounded to "manipulate BPS within an existing claimer set." Cannot
  drain funds. Cannot reassign claimers. Contributor accrued fees cannot
  be touched by a manager-key compromise.
- **Manager keypair is in scope of the existing Sensitive-flagged env
  vars policy.** No new secret-handling patterns introduced.
- **Reconciliation surface is event-driven** — drift between "claimed"
  and "dispatched" cannot exist because we do not dispatch.

## Defaults

| ID | Question | Decision |
| --- | --- | --- |
| D1 | `wallets` table fate | Keep for project-owner attestation only. No contributor-linking columns. |
| D2 | Manager keypair custody | Single shared `SOLANA_MANAGER_KEYPAIR`. Per-project HD-derived keys can be added later if the blast radius story changes. |
| D3 | Fee preset config | Hard-code Bags' `Default` preset. Expose the 4-preset selector later if a launcher requests it. |
| D4 | Claimer count cap | Default 50 with override-up-to-100 as an advanced launch wizard setting. |
| D5 | GitShipt partner cut default | 500 bps (5%) default, launcher can override 0-1000 bps at launch. |

Any of these can be revisited; they are recorded here so future reviewers
can see what was deliberate vs. what was an unconsidered default.

## Rejected alternatives

### A. Per-period token launches
Each cadence period (24h/3d/etc.) spawns a new token with that period's
top-N contributors as fixed claimers at launch. Old tokens stay live
forever for historical claims.

**Rejected** because it creates an unbounded number of low-liquidity
tokens per project, fragments the trading base, and offers no benefit
over the single-token + BPS-rebalance model. The "rotation" we want is
fundamentally about *weighting*, not *membership*; weighting is what BPS
already does.

### B. Hybrid escrow buffer
Keep an `escrow_holdings` table as a "buffer" between Bags rotations —
contributors who fall out of the claimer set get their accrued moved to
escrow, then drained on wallet link.

**Rejected** because half-custody is worse than full-custody: same
regulatory surface, same code complexity, just with weirder semantics. If
we were going to custody at all, the on-chain `force_claim_user_to_vault`
(which writes to a per-user `UserFeeVault` PDA owned by the contributor's
pubkey) would be the correct primitive — but admin-only ixs (signed by
Bags) are not callable by integrators. The on-chain vault path is closed
to us, and the off-chain buffer is strictly worse than just skipping
unlinked contributors.

### C. Daily claimer rotation via "extend forever"
Use `extend_created_fee_config` with `finalize_init=false` indefinitely,
adding new contributor slots whenever the leaderboard changes.

**Rejected** because `is_init_finalized=0` blocks claim and update ixs
per the IDL field doc. There is no "extend phase that also accepts
claims" — the two are mutually exclusive program states. The token
cannot go operational without being finalized, and finalization closes
the extend door.

### D. Use the admin role for ongoing rebalances
Hold the on-chain admin role via `getTransferAdminTransaction` and call
`update_fee_config` directly. Convenient because Bags' HTTP API + their
`bags-cli` wrap exactly that path.

**Rejected** because admin authority includes operations we do not need
and would not exercise (set partner, transfer admin, extend pre-finalize,
secondary admin operations). Compromise of the admin keypair would
expose those even if we never call them. The manager pattern is bounded
in the IDL itself; we accept the cost of building the Anchor client
directly to keep the authority surface narrow.

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
