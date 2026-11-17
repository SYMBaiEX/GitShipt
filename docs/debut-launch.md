# GitShipt debut launch review

Updated November 17, 2026. **Not cleared for general mainnet creation.**

Repository: `SYMBaiEX/GitShipt`. Production: Vercel
`symbiexs-projects/gitshipt`, aliased by `gitshipt.com` and `gitbags.com`.

## Confirmed blocker: manager authorization

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

The token admin in Bags' API and the Bags program administrator are different
authorities. The app now refuses to prepare the unsupported owner-only delegation
instead of asking the owner to pay for a doomed transaction. Obtain an authorized
manager-delegation flow from Bags and verify it before promising automatic daily
on-chain leaderboard rebalancing. Existing correctly delegated configs are not
disabled by this guard. A plain token launch would not prove the core reward
automation works.

## Other launch gates

- Production strict health last returned 503: explicit
  `BAGS_ALLOW_PROD_LAUNCH=true` is absent and the Sensitive-secret attestation is
  unset. Keep creation disabled until the blockers are resolved. Never attest
  secret visibility without reviewing it.
- Rotate the Bags API key supplied in chat before handling live funds. Its
  read-only partner-statistics check succeeded. The supplied credential and
  corrected partner settings were saved for Vercel Production as appropriate;
  key material stays in ignored local configuration and Sensitive variables.
- Confirm the config payer signer matches the partner wallet. No existing
  production private key was retrieved or decrypted during this review.
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
- Direct Bags-linked contributor allocations plus an explicit platform treasury
  slot, totaling 10,000 BPS. Rebalances preserve the treasury snapshot.
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

Verified locally for this release:

- TypeScript 7 typecheck, ESLint, design-token lint, and production build pass.
- 322 tests pass across 58 files, including cross-SDK partial signatures,
  platform allocation preservation, RLS fee lookup, and malformed account data.
- Playwright passes 4 public routing/SEO tests; 7 fixture-dependent tests skip.
- The high/critical advisory gate passes without exceptions.
- Mobile public routes, keyboard navigation and reduced motion were inspected.

Unit tests use synthetic chain-account fixtures; public browser checks do not
establish authenticated or funded-flow acceptance. Host Bun is 1.4.2; the pinned
1.4.4 release was separately used for frozen-install and typecheck verification.

## Debut procedure after the blockers are resolved

1. Deploy the reviewed release, review secret visibility, rotate the exposed key,
   and verify strict health and all actual wallet/config bindings.
2. Arrange and verify the authorized Bags manager integration. Do not bypass
   the guard or set a DB flag to pretend delegation succeeded.
3. Sign in with SYMBaiEX, verify GitHub repo-admin access and GitHub App
   installation for `SYMBaiEX/GitShipt`, and enroll MFA for admin controls.
4. Have intended contributors link GitHub on Bags. Save a draft and reindex it;
   use a snapshot less than 24 hours old. Live configs are capped at 15 total
   recipients, including the platform slot, pending LUT support.
5. Review all three fee streams, recipient wallets, initial buy and cluster.
   The owner reviews/signs the final launch in their wallet. GitShipt pays for
   config creation and is its deployer.
6. Verify the debut token, authorized delegation, first scored rebalance, and
   receipts for each revenue stream before enabling general creation.

No schema migration is introduced by this upgrade. The local production file
is not a complete copy of Vercel secrets; missing local values do not establish
missing production credentials. No cold treasury key belongs in Vercel.
