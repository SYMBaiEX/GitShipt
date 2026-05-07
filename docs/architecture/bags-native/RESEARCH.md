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

The fee-share-v2 lifecycle has a hard one-way phase transition:

1. **Init phase** — `create_fee_config` → repeated `extend_created_fee_config`
   with `finalize_init=false`. During this phase, **`is_init_finalized=0`
   blocks claim and update ixs** (per the IDL field doc on
   `FeeShareConfig`). You can grow the claimer set but no fees can be
   claimed, and the token can't really go operational.
2. **Finalize transition** — one extend (or create) with
   `finalize_init=true`. This is one-way; you cannot extend after this
   point.
3. **Operational phase** — `update_fee_config` (admin-gated) and
   `manager_update_fee_config` (manager-gated) rebalance BPS within the
   existing slot range. The claimer **pubkeys are immutable**. Claims
   work.
4. **Locked phase** — `update_fee_config` with `finalize_update=true`
   permanently freezes everything. Irreversible.

The decision: launch with N contributor claimers (Bags-managed PDAs
resolved via `getLaunchWalletV2Bulk`) baked in at launch time, then
rebalance BPS across that fixed slot set on a configurable cadence.
GitShipt holds the manager role (admin = launching wallet, manager =
GitShipt's `SOLANA_MANAGER_KEYPAIR` set via `update_fee_config_manager`
post-launch). Contributors who emerge after launch don't get a slot —
the contributor set is fixed at launch.

Full decision rationale, including the rejected hybrid + per-period
alternatives, lives in
[`../../adr/0001-bags-native-payout.md`](../../adr/0001-bags-native-payout.md).

## How to re-derive the conclusions

Three subcommands on the inspector script, in order of escalating cost:

### `inspect-program` — IDL inspection (free, deterministic)

```bash
bun run scripts/inspect-bags-program.ts inspect-program
```

Reads the bundled `@bagsfm/bags-sdk` IDL and prints every instruction,
the shape of `UpdateFeeConfigParameters`,
`ExtendCreatedFeeConfigParameters`, `ForceClaimUserToVaultParameters`,
and the on-chain `FeeShareConfig` / `FeeShareAuthority` account
layouts. Re-run after every Bags SDK upgrade to confirm the findings
above still hold.

### `probe-live` — Live state probe (free, requires `HELIUS_RPC_URL`)

```bash
bun --env-file=.env.local run scripts/inspect-bags-program.ts probe-live
```

Pulls the top tokens by lifetime fees from Bags' public API, then for
each fetches its on-chain `FeeShareConfig` PDA and decodes the claimers
+ bps arrays. Confirms the per-claimer-index fee-tracking model holds in
production and reveals real-world claimer-set sizes.

### `experiment` — Mainnet rotation experiment (costs ~0.05 SOL, requires `LIVE=1`)

```bash
LIVE=1 bun --env-file=.env.local run scripts/inspect-bags-program.ts experiment
```

**Not implemented** — this would launch a tiny token, accrue fees via a
self-swap, then attempt `extend_created_fee_config` post-launch to
confirm the append model works on a live config. Currently only prints
the experiment plan and asks for explicit confirmation. The IDL
findings above were sufficient for the architecture decision; this
subcommand is here as a belt-and-suspenders check if a future change
needs empirical confirmation against a live config.
