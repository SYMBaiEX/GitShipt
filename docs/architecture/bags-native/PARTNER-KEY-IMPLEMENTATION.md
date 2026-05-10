# Bags Partner Claim Implementation

GitShipt receives platform revenue through the Bags partner rail:

- Partner cut: 25% / 2,500 bps, configured in Bags and referenced by `BAGS_PARTNER_CONFIG_KEY`.
- Partner wallet: `BAGS_PARTNER_WALLET`.
- Signing key: `SOLANA_PAYOUT_KEYPAIR`, whose public key must equal `BAGS_PARTNER_WALLET`.
- Claim ledger: `partner_fee_claim_attempts`.

There is intentionally no separate `BAGS_PARTNER_KEYPAIR` and no GitShipt-side partner-config table. The Bags API remains the source of truth for partner stats and claim transactions.

## Runtime Path

Manual claims run through `apps/web/app/admin/actions.ts`:

1. Revalidate the super-admin session.
2. Require destructive-action confirmation and two-super-admin cosign.
3. Verify `BAGS_API_KEY`, `BAGS_PARTNER_CONFIG_KEY`, and `SOLANA_PAYOUT_KEYPAIR`.
4. Reserve a `partner_fee_claim_attempts` row with an idempotency key.
5. Execute `apps/web/lib/funds/partner-fee-claims.ts`.

Cron claims run through `apps/web/workflows/claimPartnerFees.ts` and `/api/cron/claim-partner-fees` on the daily Vercel Cron schedule.

## Claim Execution

`apps/web/lib/funds/partner-fee-claims.ts` is the only implementation that signs and submits partner claims. It:

1. Reads uncached Bags partner stats.
2. Calls Bags' partner claim transaction endpoint.
3. Signs each Bags-provided transaction with `bags.signAndSubmitTransaction`.
4. Enforces the `partner-claim` instruction policy before signing.
5. Confirms each Solana signature.
6. Reads uncached Bags partner stats again and stores observed deltas.
7. Marks the attempt `review` when a signature may have landed but the accounting delta is not observable.

This keeps GitShipt aligned with the Bags-native model: Bags owns the partner config and claim transactions; GitShipt records attempts, validates transaction shape, signs only with the expected partner wallet, and audits the result.

## Required Env

- `BAGS_API_KEY`
- `BAGS_PARTNER_WALLET`
- `BAGS_PARTNER_CONFIG_KEY`
- `SOLANA_PAYOUT_KEYPAIR`
- `HELIUS_RPC_URL`
- `CRON_SECRET`

All secrets and key material must be flagged Sensitive in Vercel. Cold treasury keys never enter Vercel.
