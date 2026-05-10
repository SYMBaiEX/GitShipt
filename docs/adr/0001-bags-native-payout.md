# ADR 0001 — Bags-native payout architecture

**Status:** Accepted
**Date:** 2026-05-07
**Last Updated:** 2026-05-09 (corrected fee-share capabilities)
**Research backing:** [docs/architecture/bags-native/RESEARCH.md](../architecture/bags-native/RESEARCH.md)

---

## Context

GitShipt's payout flow has to evolve a project's contributor leaderboard
into on-chain fee-share weights. The current architecture leverages Bags'
fee-share-v2 program with both manager and admin authorities to enable
dynamic contributor management.

**CORRECTED UNDERSTANDING (2026-05-09):**

Earlier analysis incorrectly concluded that Bags fee-share claimers are
immutable. Research into Bags API documentation and CLI commands reveals
that **claimers CAN be updated post-launch** via admin authority:

- **Admin update capability:** The Bags CLI provides `bags config update`
  which allows changing fee claimers and their BPS allocations after launch
- **API endpoint:** `POST /fee-share/admin/update-config` creates transactions
  to update fee share configurations, allowing admin to change claimers
- **Manager rebalance:** The manager role (separate from admin) can rebalance
  BPS across existing claimers via `manager_update_fee_config`
- **Partner revenue:** GitShipt receives 25% (2,500 bps) of trading fees via
  partner configuration, separate from the 10,000 bps contributor envelope

**Authority separation:**

- **Admin role:** Held by project owner, can update claimers and BPS
- **Manager role:** Delegated to GitShipt, can rebalance BPS within claimer set
- **Partner role:** GitShipt's partner config receives 25% of trading fees

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

2. **Project owner (admin) can update claimers post-launch** via
   `bags config update` or the Bags API endpoint
   `POST /fee-share/admin/update-config`. This enables **dynamic contributor
   inclusion** — new contributors can be added to the claimer set as they
   emerge, and inactive contributors can be removed. This resolves the
   core constraint that was previously thought to be immutable.

3. **Manager-keypair BPS rebalance** on a per-project configurable cadence
   (24h initial → 3d second → 3/5/7d configurable thereafter). The on-chain
   `manager_update_fee_config` instruction with the new BPS vector adjusts
   fee distribution within the current claimer set.

4. **Contributors claim directly through Bags' GitHub-OAuth UI.** GitShipt
   never holds, routes, or dispatches contributor SOL. Real-time per-claim
   attribution comes from subscribing to `BagsFeeShareUserClaimV2Event`
   via Helius enhanced webhooks.

5. **GitShipt revenue via Bags partner configuration:** GitShipt creates a
   partner key (partner config) that receives **25% (2,500 bps) of trading fees**
   from all tokens launched through the platform. This is separate from the
   10,000 bps contributor envelope and requires no launch fees. Partner fees
   are claimed directly from Bags by GitShipt's partner wallet.

6. **Maximum 100 contributor slots per token** (Bags-imposed). Default cap
   is 50 with override-up-to-100 as an advanced launch setting.

## Architecture map

| Concern                                     | Location                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| On-chain program client (manager ixs, PDAs) | `apps/web/lib/bags/program-client.ts`                                       |
| Bulk handle → wallet resolution (Bags HTTP) | `bags.resolveLaunchWalletsBulk` in `apps/web/lib/bags/client.ts`            |
| Anchor event parser (claim events)          | `apps/web/lib/bags/program-events.ts`                                       |
| Manager keypair signer                      | `apps/web/lib/solana/manager-signer.ts`                                     |
| Launch persistence + delegation tx          | `apps/web/lib/bags/launch-integration.ts`                                   |
| BPS allocation logic (pure)                 | `apps/web/lib/payouts/bps-plan.ts`                                          |
| Cadence-driven rebalance workflow           | `apps/web/workflows/rebalanceBps.ts`                                        |
| Cadence cron handler                        | `apps/web/app/api/cron/rebalance-bps/route.ts`                              |
| Helius webhook handler                      | `apps/web/app/api/webhooks/helius/bags-events/route.ts`                     |
| Schema                                      | `apps/web/db/schema/{bags-fee-share,bags-claim-events,payout-schedules}.ts` |
| Launch wizard cadence selector              | `apps/web/app/(public)/launch/_components/CadenceSelector.tsx`              |
| Post-launch delegation step UI              | `apps/web/app/(public)/launch/_components/ManagerDelegationStep.tsx`        |

## Constraints we accept

- **Dynamic contributor inclusion via admin updates.** The project owner
  (admin) can add/remove contributors post-launch via `bags config update`
  or the Bags API. This enables ongoing contributor inclusion as the
  community evolves.
- **Maximum 100 contributor slots per token** (Bags-imposed). Default cap
  is 50 with override-up-to-100 as an advanced launch setting.
- **Contributors must have Bags-linked wallets** to be included in the
  claimer set. GitShipt provides outreach helpers but does not
  pre-allocate slots. Contributors not on Bags at launch can be added
  later via admin update.
- **Bags HTTP API rate limit (1000 req/hr/IP)** must be budgeted for
  during bulk launch operations.
- **Helius enhanced webhooks may drop events** — periodic polling can
  catch drift if it becomes a problem.

## Security posture

- **No SOL custody.** The blast radius of any GitShipt key compromise is
  bounded to "manipulate BPS within an existing claimer set" for the
  manager role, while the admin role can update claimers. Cannot drain funds.
  Contributor accrued fees cannot be touched by a manager-key compromise.
  Admin role compromise could allow claimer updates, but project owner
  retains admin control and can revoke manager delegation.
- **Manager keypair is in scope of the existing Sensitive-flagged env
  vars policy.** No new secret-handling patterns introduced.
- **Reconciliation surface is event-driven** — drift between "claimed"
  and "dispatched" cannot exist because we do not dispatch.

## Defaults

| ID  | Question                     | Decision                                                                                                                                                                |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `wallets` table fate         | Keep for project-owner attestation only. No contributor-linking columns.                                                                                                |
| D2  | Manager keypair custody      | Single shared `SOLANA_MANAGER_KEYPAIR`. Per-project HD-derived keys can be added later if the blast radius story changes.                                               |
| D3  | Fee preset config            | Hard-code Bags' `Default` preset. Expose the 4-preset selector later if a launcher requests it.                                                                         |
| D4  | Claimer count cap            | Default 50 with override-up-to-100 as an advanced launch wizard setting.                                                                                                |
| D5  | GitShipt partner cut default | 2,500 bps (25%) via `BAGS_PARTNER_CONFIG_KEY`. This is a platform-level Bags partner configuration, not a launcher override inside the 10,000 BPS contributor envelope. |

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
fundamentally about _weighting_, not _membership_; weighting is what BPS
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
