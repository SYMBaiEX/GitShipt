# ADR 0002: GitShipt revenue and launch checkpoints

Accepted November 17, 2026, following the owner's explicit choice of partner
revenue, deployer revenue, and 10% of normal creator rewards. This decision
supersedes ADR 0001's partner-only economics and inaccurate percentage wording.

## Three separate revenue streams

1. **Partner:** the configured Bags partner rate applies to Bags' platform pool,
   not trading volume or the contributor pool. The normal partner rate is 2,500
   BPS; custom rates require Bags approval. The referral URL is attribution, not
   a substitute for including the verified partner configuration in launches.
2. **Deployer:** new SOL fee-share-v2 configs reserve 25% of the gross claimers
   pool for the config payer. GitShipt's `SOLANA_PAYOUT_KEYPAIR` pays for config
   creation, so GitShipt is the deployer. The repo owner's different final launch
   wallet remains config admin; it does not replace the deployer. Bags exposes
   no public field to select another deployer or change this deployer rate.
3. **Normal recipient:** `fees.platform_bps` in `platform_config` controls the
   default for new configs, falling back to 1,000 BPS (10%). GitShipt's treasury
   receives that portion of the normal recipient pool, after the deployer cut.
   The remaining normal allocation goes directly to eligible contributors.

All normal recipient BPS still total **10,000**, including GitShipt's explicit
treasury slot. Do not subtract the deployer share from this BPS total. Fees are
calculated in integer lamports; displayed examples are illustrative, not quotes.

For a 1 SOL protocol fee claim, assuming a 50% Bags platform split, a 25% partner
rate on that platform pool, and GitShipt's 10% normal allocation:

| Destination                  |    SOL |
| ---------------------------- | -----: |
| Bags after partner deduction |  0.375 |
| GitShipt partner             |  0.125 |
| GitShipt deployer            |  0.125 |
| GitShipt normal allocation   | 0.0375 |
| Contributors                 | 0.3375 |

GitShipt totals 0.2875 SOL in this example. Advertising the combined model as
"only 10% of trading fees" would be incorrect. Compounding, actual platform
rates, rounding, and existing config terms can change the result.

## Authorization Finding

The old owner-only manager-delegation flow is not valid on mainnet. A read-only
simulation against a config whose owner was attested by Bags' admin-list API
failed with program error 6009 (`Unauthorized`), comparing that owner against
the Bags program administrator. GitShipt now refuses to build that transaction.
Bags must provide the authorized manager-delegation integration before automatic
daily rebalancing can be promised. See [the debut review](../debut-launch.md)
for exact public evidence. Bags' token admin and the on-chain program admin are
different authorities; they must not be conflated.

## Snapshots, Rebalances, and Recipient Changes

The server reads the global default, requires review of the current rate, and
persists it on the project before live config creation. Owners cannot lower it
by changing a client payload. Changing the global default does **not** change
existing on-chain configs or prepared launches.

The manifest marks the normal platform recipient as `provider: wallet`,
`socialHandle: gitshipt:platform`, with its immutable `initialBps`. Daily scored
rebalances reserve this allocation and divide only the remainder among the
existing contributor slots. An ambiguous legacy wallet manifest or a mismatched
project snapshot fails closed rather than guessing which wallet deserves fees.

Post-launch recipients and BPS are **not immutable**: Bags' admin update endpoint
can prepare an ordered transaction set through Bags' token-admin authorization.
The repo owner is that API-recognized token admin. GitShipt's global fee control does not
silently exercise it. Current GitShipt manager rebalances do not automatically
onboard new contributors; owner-admin updates need separate review, signing,
on-chain confirmation, and reconciliation of the local manifest before resumed
automation. Do not claim that this owner-update UI has been implemented here.

The manager IDL is not proof of a narrower security boundary by itself. The app
constructs BPS updates against persisted slots, but claims that the deployed
program cannot replace recipients require independent on-chain verification.

## Recovery and reporting

Before broadcasting live config transactions, persist the intended mint,
metadata, wallet, fee snapshot, and manifest. Mark the project
`launch_configured` with no config key until creation succeeds. An interrupted
attempt must stop for reconciliation instead of generating another mint.

Partner claims retain the existing claim ledger. The admin page reports deployer
balances from the dedicated Bags deployer endpoint, without counting the shared
vault twice. A failed or unreconciled read is unavailable, not zero. Indexed
treasury claims are partial event history, not complete lifetime revenue.
Deployer claims are not automatically submitted by this change; use the Bags
deployer claim flow with the actual config payer until a separately reviewed
transaction-policy and receipt-ledger integration is available. Never treat the
normal contributor claim endpoint as a deployer claim endpoint.

Contributors still claim through Bags. GitShipt does not custody their SOL.
No launch, claim, or funding transaction was executed by this review.

## Primary Sources

Verified against current Bags documentation on November 17, 2026:

- [Deployer fees and accounting](https://docs.bags.fm/how-to-guides/deployer-fees)
- [Create fee-share configuration](https://docs.bags.fm/api-reference/create-fee-share-configuration)
- [Admin recipient/config updates](https://docs.bags.fm/api-reference/create-fee-share-admin-update-config)
- [Partner configuration](https://docs.bags.fm/how-to-guides/create-partner-key)
