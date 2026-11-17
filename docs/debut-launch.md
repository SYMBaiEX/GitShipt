# GitShipt debut launch review

Updated November 17, 2026. **Owner-rewards debut approved; operational checks
below still apply. No token has been launched by this review.**

Repository: `SYMBaiEX/GitShipt`. Production: Vercel
`symbiexs-projects/gitshipt`, aliased by `gitshipt.com` and `gitbags.com`.

## Debut Reward Model

New launches use the verified personal repository owner's linked launch wallet
for normal rewards. The default normal allocation is 90% owner / 10% GitShipt,
with separate Bags partner and config-payer deployer streams. The global admin
rate affects new configs only. Leaderboards are informational in owner mode.
There is no manager-delegation step or payout schedule for this mode.

Public personal repositories only: GitHub account and repository IDs are
revalidated at prepare/resume/completion. Repo-admin permission is insufficient.
Organization repositories and new contributor-mode live launches are blocked.
Existing projects without a mode keep their contributor configuration. An
unprepared legacy draft can convert only after an explicit review.

See [ADR 0003](adr/0003-owner-rewards-debut.md) for the approved policy.

## Supported Bags Authorization

An unsigned, read-only mainnet simulation against token
`7bVZh1HKWTT7YHPkEgZzCNKz8HzsZLsHn3qvvXwGBAGS` rejected the existing owner-only
`update_fee_config_manager` flow with error 6009 (`Unauthorized`) from
`programs/bags-fee-share/src/state/program_config.rs:36`.

- The Bags admin-list API attested the simulated wallet as token admin.
- The program config was fetched at finalized commitment and checked for its
  program owner and discriminator.
- Its program administrator is
  `ADMNwg6TjZz6hs9F9rgH7PDLoTcJEVuCcXML6oQkJXU2`, not the token admin wallet.
- Simulation disabled signature verification; no transaction was signed or sent.

The token admin and Bags program administrator are different authorities. The
app refuses the unsupported delegation transaction. This does not block the
approved owner model because it never needs a manager or a scored rebalance.

The documented admin-update API was also tested with the same existing token
and unchanged recipient allocation. It returned a transaction with a valid Bags
program-admin co-signature, leaving the token admin's wallet signature missing.
Unsigned mainnet simulation succeeded. No transaction was signed or sent.
This is a supported wallet-approved update flow, not an unattended authority
grant. A future update UI must preserve partial signatures, obtain wallet
approval, confirm the ordered transactions and reconcile the local manifest.
Already delegated legacy configs can continue; new unattended contributor
automation still needs a separately verified authorization design.

## Other launch gates

- Require deployed strict health, the explicit `BAGS_ALLOW_PROD_LAUNCH=true`
  opt-in, and a review of the actual config-payer and treasury public keys.
  Production secret metadata was reviewed: 23 credential variables are Secret
  protected, including database and Redis URLs. The reviewed attestation was
  saved without reading, decrypting or replacing credential values.
- The owner explicitly chose to retain the Bags API key supplied in chat.
  Its read-only partner-statistics check succeeded and it is stored as a
  protected Vercel Secret. It has not been rotated; rotation remains strongly
  recommended before handling live funds. Never repeat the key in logs or docs.
- The config payer and partner wallet may differ. A mismatch means partner
  claims must be manual in Bags; the automatic claim workflow records a skip,
  not an error/retry loop. No production private key was retrieved or decrypted.
- Verify the config payer has sufficient SOL for config/deployer accounts and
  transaction costs. The user's linked wallet signs the final launch and funds
  any initial buy. Public balances do not establish permission to spend.
  On November 17, the deployed signer public key
  `Cj8mnM3kWH4pxZm81gA4oGMAgJTkQ8kwQ2GhiNV4UAEK` had a finalized balance of
  zero lamports. Funding remains required; no agent transferred funds.
- No funded launch, real delegation, rebalance, or fee claim was executed.
- Deployer balances are reported, but automatic deployer claiming is not
  implemented. Use Bags' dedicated deployer claim flow, not contributor claims.
- Runtime recipient-array decoding and the full Meteora-config binding have not
  been independently verified on-chain. The published SDK IDL explicitly labels
  its fixed-size recipient structure as legacy, not a runtime decoder.

## Revenue and configuration

See [ADR 0002](adr/0002-platform-revenue.md) for accounting and current primary
sources. GitShipt receives three streams: partner revenue, config-payer deployer
revenue, and a default 1,000 BPS share of the remaining normal recipient pool.
The admin page controls the last rate for **new** configurations only. Existing
prepared/live configs retain their snapshot; retroactive changes need the Bags
token-admin flow and local reconciliation.

The supplied public partner config is
`HXs58Qa6YtgJfWVkQVnpFmw6WoEdFEL4LLD1ArZjMvTH`. Its verified partner wallet is
`4ZNjNq4HsBXBPDi3DoegtZj4X5x6yesx5Efb8ZnzbeJc`. The on-chain account has
platform-side rate 2,500 BPS and creator-side rate zero. SDK 1.4.4's default
decoder omits the mode and platform rate; GitShipt now reads those fields and
validates account ownership, discriminator, and wallet PDA. Do not confuse the
config address with the wallet address or reject this config because its
creator-side rate is zero. Referral attribution remains `symbiex`.

## Implemented safeguards

- Server-selected fee defaults with explicit client review; ordinary launchers
  read the same effective setting through a narrowly scoped RLS context.
- Direct owner-wallet and explicit platform treasury slots totaling 10,000 BPS
  for new owner launches. Legacy rebalances preserve their treasury snapshot.
- Pre-broadcast mint/manifest checkpoints. Interrupted configuration stops for
  reconciliation instead of silently generating another mint.
- Confirmed fixed header checks for the fee-share PDA, program, discriminator,
  mint pair, partner bindings, and initialization/lock flags. Bags separately
  attests the token admin via its API; that is not an on-chain authority proof.
- Completion verifies the successful launch transaction, expected payer/mint,
  DBC invocation and mint creation. Uninitialized configs cannot rebalance.
- SYMBaiEX's immutable GitHub account ID `192078165` was promoted to super admin
  in a database transaction with an audit record, then read back successfully.
  Email-based automatic admin promotion was removed. MFA and two-admin approval
  for irreversible actions remain required.
- Admin pages separate partner, deployer, and treasury accounting. Unavailable
  and partially indexed totals are labeled, not fabricated as zero.

## Upgrade verification

Core versions: Bun 1.4.4, Node 26 LTS, Next 16.4.6, React 19.3.1,
TypeScript compiler 7.0.2, ESLint 10.15, Better Auth 1.7.25, Bags SDK 1.4.4,
Workflow 5.5.0. TypeScript's version-6 API runs alongside the native v7 compiler
for compatible framework/lint integrations. Solana web3 stays on its v1 family
for Bags compatibility. HTTP/3 remains experimental and is not enabled.

The high/critical dependency audit passes without exceptions. A pure-JavaScript
`bigint-buffer` replacement avoids the unpatched vulnerable native binding;
clean frozen installation and SDK resolution were checked. Moderate transitive
advisories remain. See [security notes](security-audit-exceptions.md).

Verified locally for the owner-rewards release:

- TypeScript 7 typecheck, ESLint, design-token lint, and production build pass.
- 351 tests pass across 66 files. Tests cover cross-SDK partial signatures, allocation preservation,
  identity guards, RLS fee lookup and malformed account data.
- Playwright passes 4 public routing/SEO tests; 7 fixture-dependent tests skip.
- The high/critical advisory gate passes without exceptions.
- Mobile public routes, keyboard navigation and reduced motion were inspected.

Seven mocked API tests cover owner prepare/resume and rejected owner, wallet,
manifest and header states. They do not exercise real services, wallet signing,
or the separate web-action completion flow. Unit tests use synthetic chain
fixtures; public browser checks do not establish authenticated or funded-flow
acceptance. Host Bun is 1.4.2; the pinned
1.4.4 release was separately used for frozen-install and typecheck verification.

## Vercel Runtime Errors

Production logs contained 12 missing-`jose` module errors from Queue's OIDC
helper on GitHub webhook and cron routes. The app now provides compatible
`jose` 5.10, explicitly traces its runtime files, and checks all affected route
traces after each build. Initial local checks passed, but production smoke
checks still returned 500: nested OIDC copies of `jose` shadow the root copy,
and Bun chooses their browser export while Node traces their CJS export. The
initial includes covered the root browser files only. The follow-up includes
the full nested packages and tests relocated traced files under Bun, including
the actual workflow execution route. Deployment must be checked separately;
local trace membership alone is not proof that live imports work.

Two older partner-claim failures came from different payer/partner wallets.
That state now reports manual claims rather than repeatedly failing automation.

## Debut Procedure

1. Deploy the reviewed release, review the retained-key risk (rotation is
   recommended), verify strict health and inspect fresh deployment logs. Enable creation only
   after operational checks; do not use a placeholder credential.
2. Sign in as SYMBaiEX, verify personal ownership of `SYMBaiEX/GitShipt`, and
   enroll MFA for admin controls. No Bags manager grant or GitHub App install is
   required for owner-mode creation. Optional indexing needs its own access.
3. Link the intended owner launch wallet with SIWS. Create a new owner-mode
   draft or explicitly convert an unprepared legacy draft. Choose token name,
   symbol, image, description and optional initial buy.
4. Review all three fee streams, exact recipient wallets, current platform
   rate and mainnet cluster. Ensure owner and treasury wallets are distinct.
   GitShipt's configured payer creates the fee config and earns deployer fees.
5. The owner reviews/signs the final launch transaction in their wallet. This
   review did not authorize any agent to sign or broadcast it.
6. Verify token/config bindings and Bags recipient allocation after launch.
   Confirm owner, treasury, deployer and partner accrual/claim receipts before
   making claims about revenue. Do not expect a contributor rebalance job.

No schema migration is introduced by this upgrade. The local production file
is not a complete copy of Vercel secrets; missing local values do not establish
missing production credentials. No cold treasury key belongs in Vercel.
