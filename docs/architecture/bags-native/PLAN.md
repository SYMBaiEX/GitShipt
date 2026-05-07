# Bags-Native Payout Migration Plan

**Status:** DRAFT — pending user sign-off before any code changes.
**Owner:** GitShipt
**Date:** 2026-05-06
**Supersedes:** Current escrow + dispatch + claim architecture.
**Companion docs:**
[RESEARCH.md](./RESEARCH.md) (research backing),
[../../adr/0001-bags-native-payout.md](../../adr/0001-bags-native-payout.md) (decision record),
`SPEC.md` (Phase 1 invariants).

---

## 1. The architecture in one paragraph

GitShipt becomes a **GitHub-aware leaderboard with a manager-keypair signing
BPS rebalances on a configurable cadence**. At launch we resolve the top-N
contributors to Bags-managed PDAs via `getLaunchWalletV2Bulk`, set them as
fee-share claimers, transfer the on-chain manager role to a GitShipt-controlled
keypair, and then on cadence we rebalance BPS via `update_fee_config` to
reflect current rank. **Contributors claim directly through Bags' GitHub-OAuth
UI** — we never custody, never dispatch, never run an escrow.

Cadence: **24h initial → 3d second → configurable 3/5/7d** (per-project setting).

Revenue: GitShipt's cut rides on Bags' **partner config** (already wired),
structurally separate from the contributor BPS split.

This is the only architecture compatible with the on-chain `fee-share-v2`
program (program id `FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK`):
claimer pubkeys are immutable post-finalize, only BPS rebalances within an
existing slot range. See [`RESEARCH.md`](./RESEARCH.md) for the IDL-level
proof.

---

## 2. Why this is different from current code

| Current architecture | New architecture |
| --- | --- |
| We claim Bags fees into our platform wallet | Contributors claim from Bags directly |
| We dispatch SOL per-recipient to linked wallets | No dispatch — Bags' on-chain vaults hold the fees |
| Contributors link wallets to GitShipt via SIWS | Contributors link GitHub to Bags (off our system) |
| Unlinked → escrow_holdings → 30d expiry → admin review | Unlinked → not in claimer set at launch (skipped) |
| Daily cron: snapshot → claim → dispatch → reconcile | Daily cron: snapshot → BPS rebalance via manager keypair |
| Drift detector polls escrow vs claimed amounts | Helius webhook subscribes to BagsFeeShareUserClaimV2Event |
| Required: SOLANA_PAYOUT_KEYPAIR with full SOL transfer authority | Required: SOLANA_MANAGER_KEYPAIR with BPS-rebalance-only authority |

**Net code change:** ~70-80% subtractive. The `executePayout` workflow shrinks
from 232 lines + 11 step helpers to ~50 lines + 3 step helpers.

---

## 3. Phased PR plan

Six PRs, in this order. Each is independently reviewable, deployable, and
revertable. Phases 1-3 add capability without breaking the old path; Phases
4-6 cut over and remove the old surface.

### Phase 1 — SPEC + ADR (no code)

**One PR. Docs only. No risk.**

Files:
- `SPEC.md` — Update to reflect the new model:
  - Replace "we index, rank, snapshot, and dispatch" with "we index, rank, snapshot, and rebalance"
  - Replace "no grace windows, no claim windows" wording with explicit invariants on the manager-keypair model
  - Add: contributor onboarding to Bags is a launch-time prerequisite; unresolved handles at launch are skipped, not held
  - Add: cadence is configurable per-project (24h | 3d | 5d | 7d), default 24h initial → 3d ongoing
  - Remove "Bags is the source of truth for fee claims and incorporation. We index, rank, snapshot, and dispatch" → replace with "Bags is the source of truth for fee claims, incorporation, AND custody. We index, rank, snapshot, and rebalance BPS via the manager role."
- `docs/adr/0001-bags-native-payout.md` — New ADR capturing:
  - Context: why we initially built escrow + dispatch
  - Decision: switch to manager-keypair-signed BPS rebalances
  - Consequences: what gets deleted, what new constraints we accept
  - Rejected alternatives: per-period token launches, hybrid escrow buffer
- `gitshipt-prd.md` — Note the architecture shift in a "v1.1 migration" callout

**Approval required before merging.** Once SPEC is signed, the rest is execution.

### Phase 2 — Additive Bags client + workflow infrastructure

**One PR. Pure additions. Old workflows untouched.**

New code in `apps/web/lib/bags/client.ts`:
- `resolveLaunchWalletsBulk(handles: ResolveHandle[])` — wraps `state.getLaunchWalletV2Bulk` (currently we call `getLaunchWalletV2` one-at-a-time)
- `getUpdateFeeConfigManagerTransaction(...)` — wraps the admin → manager transfer
- `getUpdateConfigWithLookupTableTransactions(...)` — wraps `feeShareAdmin.getUpdateConfigLookupTableTransactions` for >15-claimer rebalances
- `getAuthMe()` — wraps `auth.me()` for boot-time API key verification

New code in `apps/web/lib/solana/`:
- `manager-signer.ts` — separate from `signer.ts`, loads `SOLANA_MANAGER_KEYPAIR` (new env var)
- `program-events.ts` — Helius enhanced webhook payload parser for the 14 Bags fee-share events

New schema in `apps/web/db/schema/`:
- `bags-claim-events.ts` — append-only log: `id, project_id, contributor_id, slot_index, claimer_pubkey, lamports, blocktime, tx_signature, ingested_at` — sourced from on-chain events
- `bags-fee-share-configs.ts` — per-project: `id, project_id, fee_share_config_pda, manager_pubkey, manager_finalized_at, claimer_count, last_rebalance_at, last_rebalance_signature`
- `bags-claimer-slots.ts` — per-config: `id, fee_share_config_id, slot_index, github_handle, contributor_id (nullable), bags_pda, current_bps, joined_at`
- `payout-schedules.ts` — `project_id, cadence_hours, last_run_at, next_run_at, paused_at` — schedule state (24h | 72h | 120h | 168h)

Updated schema in `apps/web/db/schema/projects.ts`:
- ADD: `bags_fee_share_config_pda` (FK to bags-fee-share-configs)
- ADD: `payout_schedule_id` (FK to payout-schedules)
- DEPRECATE (do not drop yet): `bags_pool_claimer_wallet`

New migration:
- `apps/web/db/migrations/0021_bags_native_infra.sql` — creates the four new tables and adds the project FKs

New workflow in `apps/web/workflows/`:
- `rebalanceBps.ts` — root + per-project workflow. Per project: load latest snapshot → recompute BPS → build `update_fee_config` tx (with LUT if >15 claimers) → sign with manager keypair → broadcast → confirm → audit log → update `last_rebalance_*`
- `steps/rebalanceBps-helpers.ts` — step helpers (lock, ranking, build, sign, broadcast, audit)
- `ingestBagsEvents.ts` — root workflow: pull recent program events, write to `bags_claim_events`

New cron + route in `vercel.json` + `apps/web/app/api/cron/`:
- `/api/cron/rebalance-bps` — every 1h, picks projects whose `next_run_at <= now`
- `/api/cron/ingest-bags-events` — every 5min as a polling fallback (primary path is webhook)
- `/api/webhooks/helius/bags-events` — Helius enhanced webhook receiver

New env vars (`apps/web/lib/env.ts`):
- `SOLANA_MANAGER_KEYPAIR` — required in prod, separate from `SOLANA_PAYOUT_KEYPAIR`
- `HELIUS_WEBHOOK_AUTH_TOKEN` — verifies inbound webhook calls
- All Sensitive-flagged in Vercel.

New tests:
- `apps/web/workflows/rebalanceBps.test.ts`
- `apps/web/lib/solana/program-events.test.ts`
- `apps/web/lib/bags/client-bulk-resolve.test.ts`

**Outcome:** new infrastructure exists, old infrastructure unchanged. Nothing
in production behavior changes. Both code paths coexist.

### Phase 3 — Launch wizard rewrite

**One PR. Adds new launch flow. Old launch flow stays as fallback if needed.**

Updated UI under `apps/web/app/(public)/launch/`:
- `_components/LeaderboardConfigForm.tsx` — replace tier-weight inputs with:
  - Cadence selector: 24h initial / 3d / 5d / 7d
  - Auto-populated top-N preview (N <= 50 default, capped at 100)
  - Per-row Bags resolution status badge (✓ resolved / ⚠ not on Bags / ✗ error)
  - BPS edit grid with sum-to-10000 validation
  - Manual add-handle search (GitHub username)
  - "Use defaults" one-click button
- `_components/UnresolvedHandleDecision.tsx` — new component: "X% of merit-weighted base covered. Skip Y unresolved contributors? Or wait for them to onboard?"
- `_components/ManagerTransferConfirm.tsx` — new component in ReviewAndSign step: "GitShipt will hold a manager keypair (BPS-rebalance authority only) for ongoing automated rebalances. Project owner can revoke at any time via /dashboard/projects/[id]/settings."
- `_components/ReviewAndSign.tsx` — rewrite: wire the post-launch manager transfer tx as the final signed step
- `actions.ts` — add `transferManagerToGitShiptAction(projectId)` server action
- `WizardShell.tsx` — adjust router state for new step ordering

Updated `apps/web/app/api/projects/[id]/launch/route.ts`:
- Stop creating escrow placeholder entry
- Call `getLaunchWalletV2Bulk` for the contributor list
- After successful launch, store fee_share_config_pda + create initial payout_schedule row (24h cadence)
- After confirmation, queue manager-transfer tx for project owner to sign

New tests:
- `apps/web/e2e/launch-wizard-bags-native.spec.ts` — full happy path (stub mode)
- `apps/web/app/(public)/launch/_components/LeaderboardConfigForm.test.tsx`

**Outcome:** new launches use the Bags-native flow. No breaking changes to
existing launched projects yet (they stay on the old workflows, marked
legacy).

### Phase 4 — Reconciliation switch

**One PR. Replaces polling reconciler with event subscriber.**

- Implement `apps/web/app/api/webhooks/helius/bags-events/route.ts` end-to-end:
  - Verify `x-helius-signature` (or whatever Helius enhanced webhooks use)
  - Parse Anchor events from log messages
  - Insert claim events into `bags_claim_events`
  - Update per-config running totals
- Bootstrap script: `apps/web/scripts/register-helius-webhooks.mjs` — registers the webhook with Helius for all live `fee_share_config_pda`s
- Decommission `lib/funds/reconciliation.ts` polling: keep the file but switch the implementation to query `bags_claim_events` for verification rather than scanning chain state. (Old reconciliation tests get updated, not deleted yet.)
- Update admin reconciliation dashboard to show event-derived state instead of scanned state.

New tests:
- `apps/web/app/api/webhooks/helius/bags-events/route.test.ts`
- `apps/web/lib/funds/reconciliation-events.test.ts`

**Outcome:** real-time claim attribution. Drift detection becomes "no claim
event for slot X in N days" rather than "scanned chain says A, our DB says B."

### Phase 5 — Cutover (existing projects → new model)

**One PR. The big migration. Has runbook.**

This is the riskiest PR — it cuts over any in-flight projects. Must be
deployed during a maintenance window.

Pre-flight script `apps/web/scripts/audit-pre-cutover.mjs`:
- Lists every project on the old payout path with: open escrow_holdings rows, pending payouts, last successful dispatch
- Refuses to proceed if any project has unfinalized state

Migration script `apps/web/scripts/cutover-to-bags-native.mjs`:
- For each existing project:
  - Read its current contributor set + most recent rank
  - Resolve handles via `getLaunchWalletV2Bulk` — surface unresolved
  - Either: (a) drain escrow_holdings to contributor wallets via existing `processClaim` flow before cutover, OR (b) require contributors to claim within window then cutover
  - On the day-of: execute manager transfer for each project (project owner signs; UI prompts in dashboard)
  - Mark old payouts as `migrated_to_bags_native` status
- Post-migration validation: run a single rebalanceBps cycle for each project, confirm tx success

Schema additions:
- `payouts.status` enum gets `migrated_to_bags_native`
- `projects.architecture` enum: `legacy_dispatch | bags_native_manager` — used to gate which workflow runs

Workflow gate:
- `executePayout` checks `projects.architecture` and skips bags_native projects
- `rebalanceBps` checks the same and skips legacy projects
- Dual-running for as long as it takes to migrate all projects

**Outcome:** all projects on the new model. Old workflows running but no-op
for everyone.

### Phase 6 — Deletion + final cleanup

**One PR. The big subtractive PR. Lands once Phase 5 confirms zero legacy projects.**

Deletes:
- `apps/web/db/schema/escrow.ts` + DROP `escrow_holdings` table (migration 0022)
- `apps/web/db/schema/wallets.ts` IF unused by project-owner flows (verify via grep first; might keep for project owner attestation)
- `apps/web/workflows/expireEscrow.ts` + steps/expireEscrow-helpers
- `apps/web/workflows/processClaim.ts` + steps/processClaim-helpers
- `apps/web/workflows/steps/escrow-helpers.ts`
- `apps/web/app/api/claims/escrow/route.ts`
- `apps/web/app/api/claims/link/route.ts`
- `apps/web/app/api/wallets/nonce/route.ts` + `verify/route.ts`
- `apps/web/app/api/cron/expire-escrow/route.ts` + cron entry in vercel.json
- `apps/web/app/api/cron/payout/route.ts` + cron entry in vercel.json (new cadence cron is `rebalance-bps`)
- `apps/web/lib/payouts/distribution.ts` + tests (no more dispatch math)
- `apps/web/lib/payouts/safety.ts` + tests (no more SOL transfer safety checks)
- `apps/web/lib/auth/siws.ts` + tests IF nothing else uses SIWS (verify first)
- `apps/web/components/wallet/SignInWithSolanaFlow.tsx` IF nothing else uses it
- `apps/web/app/auth/wallet/page.tsx`
- `apps/web/app/dashboard/(account)/wallets/page.tsx`
- `apps/web/app/dashboard/(account)/earnings/_components/ClaimEscrowButton.tsx`
- `apps/web/app/dashboard/projects/[id]/payouts/_components/RetryPayoutButton.tsx`
- `packages/shared/src/payout-schemas.ts` — `ProcessClaimInput`, `ClaimLinkRequest`

Reworks (not deletes):
- `apps/web/workflows/executePayout.ts` — REMOVE `claimFeesStep` and `dispatchStep` — workflow becomes a no-op shim until full removal in a later PR
- `apps/web/lib/funds/reconciliation.ts` — remove polling-only paths (Phase 4 already added event paths)
- `apps/web/db/schema/payouts.ts` — drop dispatch fields (`txSignature`, `walletAddress`, etc.) via migration 0023
- `apps/web/db/schema/contributors.ts` — drop wallet-link columns if separate from `wallets` table
- `apps/web/lib/api-spec.ts` — drop deleted routes from OpenAPI
- `apps/web/app/dashboard/(account)/earnings/page.tsx` — switch to claimable-on-Bags + claim event feed
- `apps/web/app/dashboard/projects/[id]/payouts/page.tsx` — show claim events not dispatch log
- `apps/web/app/r/[org]/[repo]/_components/{NextPayoutCountdown,RecentPayoutsFeed,LeaderboardTable}.tsx` — cadence-aware copy + Bags resolution badges
- `apps/web/app/(public)/legal/{terms,privacy}/page.tsx` — copy update for new model
- `vercel.json` — drop `expire-escrow`, `payout`, possibly `reconcile-funds` crons

New UI added:
- `apps/web/app/dashboard/projects/[id]/settings/_components/CadenceConfigSection.tsx`
- `apps/web/app/dashboard/projects/[id]/settings/_components/ManagerKeypairStatus.tsx`
- `apps/web/app/dashboard/(account)/_components/BagsClaimEventFeed.tsx`
- `apps/web/app/dashboard/(account)/bags-link/page.tsx` — "link your GitHub to Bags" CTA + deep link

Tests:
- Delete tests for removed workflows
- Update RLS migration tests (no more escrow_holdings/wallets policies)
- Update e2e regression for new payout UI

**Outcome:** clean codebase. ~3000-5000 lines deleted net.

---

## 4. Sequencing constraints

1. Phase 1 must complete before any code change. SPEC is the contract.
2. Phase 2 must complete before Phase 3 (wizard depends on bulk resolve + manager transfer wrappers).
3. Phase 3 can ship before Phase 4 — new launches just won't have event ingestion until Phase 4.
4. Phase 4 must complete before Phase 5 — cutover validation depends on event-driven verification.
5. Phase 5 must complete (with all projects migrated) before Phase 6 — Phase 6 deletes the legacy code.
6. Phase 6 can be split into 2-3 sub-PRs if reviewers prefer (e.g. delete escrow surface, then delete dispatch surface, then UI rework).

---

## 5. Open product decisions (need user input before Phase 1)

These shape SPEC.md and the implementation. Please answer before sign-off.

### D1. Does the wallets table stay or go?

The `wallets` table currently maps `github_username → solana_address` for
contributor wallet linking. Under the new model, contributors don't link
wallets to GitShipt at all (they link GitHub to Bags). But the table may
also be used for project-owner attestation (verifying the launching wallet
matches the project owner). Need to grep usage in Phase 2.

**Default if no input:** keep the table for project-owner-only use; remove
contributor-linking columns.

### D2. Architecture toggle name + UI surface for cutover

When existing projects migrate, project owners need to consent (they're
signing the manager-transfer tx). Default: surface a banner + a one-click
"Migrate to v2 fee-share" button on the project dashboard. Alternative:
auto-migrate on the next snapshot (no consent needed, but more user-hostile).

**Default if no input:** banner + click-through, no auto-migrate.

### D3. What happens to existing escrow_holdings during cutover?

Two options:
- **(a) Drain to contributor wallets via existing processClaim flow** before cutover. Requires contributors to onboard wallets to GitShipt one last time (defeats the SIWS-deletion story slightly, but gives them their funds). Recommend a 14-day window with email/repo-comment outreach.
- **(b) Force-claim to a GitShipt holding wallet, then post a manual claim portal** for affected contributors to claim by signing a one-shot SIWS message. Worse UX but doesn't require contributors to come back.

**Default if no input:** (a) with a 14-day outreach window. Each project owner is responsible for their contributors.

### D4. Manager keypair custody — single or per-project?

- **Single keypair**: one `SOLANA_MANAGER_KEYPAIR` env var, signs rebalances for every project. Operationally simple but a single key with rebalance authority over every project is a juicy target.
- **Per-project keypair**: derive an HD-keypair per project, store the seed encrypted in DB. Better blast radius isolation but adds key-mgmt complexity.

**Default if no input:** single keypair to start, per-project deferred to v1.2.
The authority is narrow (BPS-only, can't drain) so the blast radius is
already limited.

### D5. Fee-share preset config (optional v1 feature)

Bags exposes 4 preset fee curves (Default, Low Pre/High Post, High Pre/Low
Post, High Flat). Should the launch wizard expose this as a power-user
control or hard-code Default for v1?

**Default if no input:** hard-code Default for v1, expose in settings later.

### D6. Maximum claimer count default + cap

Bags allows up to 100 claimers per token. We default 50 in the plan to leave
headroom and keep BPS allocations meaningful. Confirm or override.

**Default if no input:** 50 cap with override-up-to-100 in advanced settings.

### D7. What about the Bags partner cut for GitShipt's revenue?

The plan keeps the existing partner config wiring (`BAGS_PARTNER_*`).
Confirm: GitShipt takes a fixed % at launch (current default in
`bagsPartnerBps`?), set per-launch by the project owner with a default of
e.g. 500 (5%)?

**Default if no input:** 500 bps (5%), launcher can override 0-1000.

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Bags HTTP API rate limit (1000 req/hr) hit during Phase 5 cutover bulk resolution | Med | High | Spread cutover over multiple days; cache resolved handles in `bags_claimer_slots` |
| `update_fee_config_manager` semantics differ from IDL on a corner case | Low | High | Run the Phase 3 spike with ~0.05 SOL before relying on it in production |
| Helius enhanced webhooks drop events | Med | Med | Phase 2 includes `/api/cron/ingest-bags-events` polling fallback every 5min |
| Existing escrow contributors don't claim within window | High | Med | 14-day window + repo-comment outreach + post-window manual portal |
| Manager keypair compromised | Low | Low | Authority is bounded to BPS rebalance — can't drain. Rotate via `manager_transfer_fee_config` |
| Bags' on-chain program upgraded mid-migration | Low | High | Pin SDK version; subscribe to bagsfm/bags-sdk releases |
| LUT requirement for >15 claimers not handled | High (if missed) | High | Phase 2 includes `getUpdateConfigLookupTableTransactions` wrapper + tests |
| Project owner doesn't sign manager-transfer tx during cutover | Med | Med | Project stays on legacy until they do; banner persists |
| 100-slot ceiling hit by large-repo project | Low | Med | Cap at 50 with override + docs explain the constraint |

---

## 7. Rollback strategy

- Phase 1 (docs): revert the doc PR.
- Phase 2 (additive): code is unused; revert is safe at any time.
- Phase 3 (new wizard): old wizard still exists at the same route; revert switches the wizard back. New launches roll back to old flow.
- Phase 4 (reconciliation): old polling code stays in place during Phase 4; revert removes the webhook handler.
- Phase 5 (cutover): per-project. Each project's `architecture` enum can be flipped back to `legacy_dispatch` and the old workflow takes over. Manager transfer is irreversible on-chain, but the legacy workflow ignores it (we'd just have a dormant manager keypair).
- Phase 6 (deletion): hard to roll back without restoring deleted files. Mitigation: Phase 6 only ships after Phase 5 confirms zero legacy projects.

Database rollback: each migration has its `down` written. Backups before each phase.

---

## 8. Verification gates

Each phase must pass these before merging:

- [ ] `bun run typecheck` clean
- [ ] `bun run lint` clean (4 existing warnings allowed; no new ones)
- [ ] `bun run theme:lint` clean
- [ ] `bun run test` — all green, new tests added where logic changed
- [ ] `bun run e2e` — all green
- [ ] `bun run build` clean
- [ ] No new dependencies added without justification in PR description
- [ ] `bun audit` — no new advisories beyond the existing accepted ones
- [ ] PR description includes which Phase + which open question (if any) was answered

Phase 5 specifically also requires:
- [ ] Pre-cutover audit script clean for every project
- [ ] Manager-transfer experiment from spike `LIVE=1` mode passed
- [ ] Helius webhook receiving events for at least 24h before cutover

---

## 9. Estimated effort

Rough order-of-magnitude. Dev time only — does not include review/QA cycles.

| Phase | Files touched | Net LOC | Dev time |
| --- | --- | --- | --- |
| 1 | 3 | +300 / -50 | 2-3h |
| 2 | ~20 new + 6 edits | +1500 | 1-2 days |
| 3 | ~12 (wizard) | +800 / -400 | 1 day |
| 4 | ~8 | +600 / -100 | 6-8h |
| 5 | ~10 (mostly scripts) | +500 / -50 | 1 day + cutover ops |
| 6 | ~50 | +400 / -3500 | 1-2 days |
| **Total** | **~110** | **+4100 / -4100** | **5-7 days focused work** |

Net code change is roughly flat in line count but **dramatically simpler in
behavior**: ~70% of the deleted code is custodial/dispatch infrastructure
that's structurally unjustified under Bags-native.

---

## 10. Sign-off

- [ ] User approves the architecture (Section 1)
- [ ] User answers open decisions (Section 5: D1-D7)
- [ ] User approves the phase breakdown (Section 3)
- [ ] User approves the cutover strategy (Phase 5 + D3)

Once these four are checked, Phase 1 begins. Each subsequent phase ships as
its own PR with its own review.
