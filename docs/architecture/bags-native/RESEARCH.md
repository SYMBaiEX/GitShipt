# Spike: Bags fee-share rotation behavior

## The question

Can GitShipt rotate the on-chain claimer set day-to-day (or N-days), so that the
top contributors of a given period collect fees for that period, while older
contributors rotate out?

## The short answer (deduced from the IDL — no funds required)

**No.** The Bags fee-share-v2 program does not let you replace claimers
post-launch. The `update_fee_config` instruction's parameter struct only
contains `bps` and a slot-index range — there is no `claimers` field.

The actual on-chain model:

| Operation                    | Allowed?                              |
| ---------------------------- | ------------------------------------- |
| Add a claimer (extend slots) | Yes — `extend_created_fee_config`, only while `finalize_init=false` has not been called |
| Replace a claimer's pubkey   | **No instruction supports this**      |
| Re-weight BPS across slots   | Yes — `update_fee_config`, BPS-only, range-addressed |
| Lock the config permanently  | Yes — `update_fee_config` with `finalize_update=true` (irreversible) |
| Drain a claimer's accrued    | Yes — by the claimer (`claim_user`), or admin via `force_claim_user` / `force_claim_user_to_vault` |
| Hold accrued for an unlinked claimer | Yes — `force_claim_user_to_vault` writes to a per-user `UserFeeVault` PDA the user can later claim |

The slot at index `N` accrues fees for whichever pubkey was assigned at
`extend`/`create` time. That pubkey is **immutable** for the life of the
config.

## What this means for GitShipt's architecture

The "rotate top-N contributors daily/weekly" model I sketched in chat is
**structurally impossible** under fee-share-v2. The lifecycle has a
hard one-way phase transition:

1. **Init phase** — `create_fee_config` → repeated `extend_created_fee_config`
   with `finalize_init=false`. During this phase, **`is_init_finalized=0`
   blocks claim and update ixs** (per the IDL field doc on `FeeShareConfig`).
   You can grow the claimer set but no fees can be claimed, and the token
   can't really go operational.
2. **Finalize transition** — one extend (or create) with `finalize_init=true`.
   This is one-way; you cannot extend after this point.
3. **Operational phase** — `update_fee_config` rebalances BPS within the
   existing slot range. The claimer **pubkeys are immutable**. Claims work.
4. **Locked phase** — `update_fee_config` with `finalize_update=true`
   permanently freezes everything. Irreversible.

Realistic architectural paths under this model:

1. **Hybrid (Bags pays GitShipt, GitShipt redistributes)** — what the current
   code does. The fee-share config has a single GitShipt-controlled claimer
   slot at 10000 bps. We redistribute off-chain to ranked contributors. The
   only way to support a contributor set that grows post-launch.
2. **Per-period token launches** — each 24h/3d/7d period spawns a new token
   with that period's contributors as fixed claimers at launch. Insane for
   token-spam and liquidity reasons. Do not consider seriously.

There is no third path. The Bags primitive is more constrained than the
HTTP API surface suggests.

## What CAN simplify the current architecture

Path 1 is mandatory, but the current implementation can still get cleaner:

- Use Bags' on-chain `UserFeeVault` (`force_claim_user_to_vault`) instead of
  our DB `escrow_holdings` table for unlinked-contributor balances. Moves
  custody to Bags' on-chain primitive; eliminates a SPEC-violating DB
  surface.
- Use Bags' partner config (already wired) for GitShipt's revenue cut,
  separate from the contributor distribution. Keeps the two flows clean.
- Update SPEC to acknowledge that the off-chain redistribution layer is a
  STRUCTURAL requirement of the Bags integration, not a forbidden
  re-implementation. The current SPEC text "we do not re-build anything Bags
  already owns" is correct in spirit but needs a footnote: claimer-set
  evolution is the one capability Bags doesn't own that we must.

## Outstanding empirical question (Phase 3)

The IDL is clear enough that no live experiment is required to make the
architecture decision. Phase 3 remains a useful belt-and-suspenders check
specifically for: confirming `force_claim_user_to_vault` semantics on a
real token (does the user truly own the vault, or does the admin retain
control?). Worth ~0.05 SOL only if we proceed with the on-chain vault
pattern for unlinked contributors.

## How to run

### Phase 1 — IDL inspection (free, deterministic)

```bash
bun run scripts/inspect-bags-program.ts inspect-program
```

Reads the bundled `@bagsfm/bags-sdk` IDL and prints every instruction, the
shape of `UpdateFeeConfigParameters`, `ExtendCreatedFeeConfigParameters`,
`ForceClaimUserToVaultParameters`, and the on-chain `FeeShareConfig` /
`FeeShareAuthority` account layouts. Confirms the findings above for any
future SDK version bump.

### Phase 2 — Live state probe (free, requires `HELIUS_RPC_URL`)

```bash
bun --env-file=.env.local run scripts/inspect-bags-program.ts probe-live
```

Pulls the top tokens by lifetime fees from Bags' public API, then for each
fetches its on-chain `FeeShareConfig` PDA and decodes the claimers + bps
arrays. Confirms the per-claimer-index fee-tracking model holds in
production and reveals real-world claimer-set sizes.

### Phase 3 — Mainnet rotation experiment (costs ~0.05 SOL, requires `LIVE=1`)

```bash
LIVE=1 bun --env-file=.env.local run scripts/inspect-bags-program.ts experiment
```

**Not implemented** — this would launch a tiny token, accrue fees via a
self-swap, then attempt `extend_created_fee_config` post-launch to confirm
the append model works on a live config. Currently only prints the
experiment plan and asks for explicit confirmation. Implement before relying
on Path 2 in production.

## Decision

Path 1 (hybrid: Bags pays GitShipt, we redistribute) is the only viable
architecture given the on-chain constraints. The escrow + dispatch surface in
the current code is justified, not over-engineered.

What remains to decide:

| Question | Open until... |
| -------- | ------------- |
| Move `escrow_holdings` from our DB to on-chain `UserFeeVault`? | Phase 3 confirms vault ownership semantics. |
| 24h initial / 3d second / 3-5-7d configurable cadence — confirmed? | Locked in by user. |
| Update SPEC.md to legitimize the redistribution layer? | Pending user approval. |
