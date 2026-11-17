# ADR 0003: Owner rewards for the debut

Accepted November 17, 2026 with explicit product-owner approval. This supersedes
contributor distribution as the default for new launches, not ADR 0002's fee
economics or existing on-chain configurations.

## Decision

New live launches support public repositories owned by a personal GitHub
account. GitShipt re-fetches repository identity and compares the immutable
owner ID with the authenticated GitHub account ID and the stored repository ID
at preparation, resumption and completion. Repository-admin rights alone are
not ownership. Organization-owned and private repositories are rejected.

Normal fee-share allocations have two direct wallet slots: the owner's
SIWS-linked launch wallet receives `10000 - platformBps`; GitShipt's treasury
receives `platformBps`. The default is 9,000 / 1,000 BPS. The wallets must be
distinct and canonical. A zero platform rate omits its slot. The owner must
retain a positive share; admin settings cannot exceed 9,999 BPS. No separate
Bags GitHub identity link is required for these direct wallet recipients.

GitShipt additionally receives the config-payer deployer share and the verified
Bags partner share. These have different denominators; see [ADR 0002](0002-platform-revenue.md).
The config payer, partner wallet and normal treasury can be different wallets.
Partner automatic claims require the signer to match the partner wallet;
otherwise the workflow records a manual-claim requirement and the operator
claims from Bags. Deployer claims also remain manual through the dedicated Bags
flow. Neither limitation blocks valid owner-reward config creation.

The normal split is reviewed before preparation and persisted with the mint
and claimer manifest before broadcast. Subsequent global rate changes affect
new configurations only. The linked owner wallet and marked recipient manifest
must still match on resume. Prepared/live modes cannot change. Draft conversion
from the legacy model requires an explicit review and guarded persistence.

Owner mode creates no payout schedule and never runs a scored rebalance, even
if a stale schedule exists. GitHub indexing and snapshots can continue for
informational leaderboards. Scores, ranks and snapshot weights are not owner-mode
payout promises. Fees accrue in Bags under the fixed allocation; recipients
claim there. No GitShipt custody or daily SOL dispatch is introduced.

Legacy projects with no reward-mode field remain contributor mode. Correctly
delegated legacy schedules are preserved. New live contributor-mode creation is
blocked rather than launching a token with unsupported unattended management.
The JSON payout configuration gains an optional mode; no SQL migration is needed.

## Supported Bags Update Flow

The original owner-only manager-delegation instruction failed mainnet unsigned
simulation with error 6009 (`Unauthorized`). The token admin and Bags program
administrator are not interchangeable.

The documented `POST /fee-share/admin/update-config` provides a different flow.
An unchanged allocation for existing token
`7bVZh1HKWTT7YHPkEgZzCNKz8HzsZLsHn3qvvXwGBAGS` returned an ordered transaction
set requiring the token admin's wallet and containing a Bags program-admin
signature. The latter was cryptographically verified against the original
message, and an unsigned mainnet simulation succeeded. No transaction was
signed or broadcast. A random unrelated payer produced an API error, not a
documented authorization response; do not treat that test as a complete auth audit.

This demonstrates a supported wallet-approved update, not an unattended
delegation grant. Automatic updates would require control of the actual token
admin key or another explicitly authorized Bags integration. GitShipt does not
silently acquire that authority. A future update UI must preserve Bags partial
signatures, have the wallet review/sign the ordered transactions, confirm them,
and reconcile the local manifest before any automation resumes.

## Primary Sources

Checked November 17, 2026:

- [Admin update configuration](https://docs.bags.fm/api-reference/create-fee-share-admin-update-config)
- [Create fee-share configuration](https://docs.bags.fm/api-reference/create-fee-share-configuration)
- [Bags CLI reference](https://docs.bags.fm/cli/command-reference)
- [Deployer fees](https://docs.bags.fm/how-to-guides/deployer-fees)

Current create-config documentation requires lookup tables above seven
recipients; the installed SDK's higher inline threshold is not current policy.
The two-slot owner model does not need a lookup table. Runtime recipient-array
decoding remains an independent verification gap; legacy IDL structures must
not be presented as proof of runtime layout.
