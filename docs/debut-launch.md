# GitShipt debut token: launch review and runbook

Reviewed November 17, 2026. **Not cleared for a mainnet launch yet.**

## Deployment identified

- Repository: `SYMBaiEX/GitShipt`, GitHub repository ID `1224181010`.
- Vercel: `symbiexs-projects/gitshipt`, project `prj_drvQhGvOA0nwAKir90OV94sy1lnr`.
- Both `gitshipt.com` and `gitbags.com` alias this project.
- Production before this review: June 2 deployment of commit `7e0dbd9`.
- The connected Vercel MCP returned no projects; the local authenticated CLI
  successfully found and inspected the project. A connector 404 did not mean
  that the deployment had been deleted.

## Outstanding release blockers

1. **Dependency security audit fails.** `bun run security:audit` reports high
   and critical advisories, including Next.js, Better Auth, Axios, and transitive
   packages. The `bigint-buffer` exception expired June 15, 2026. Update the
   affected packages and override floors to the patched ranges in the advisories,
   then repeat typecheck, lint, tests, build, E2E, and the audit. Do not renew
   exceptions just to obtain a green check. This review did not perform a broad
   runtime/dependency migration.
2. **Production strict health is HTTP 503.** The live check reports all required
   service credentials present and DB/Redis reachable, but the Sensitive-secret
   attestation is missing. Vercel lists some database URLs/passwords as
   non-sensitive; review and correct their visibility before setting
   `SECRETS_SENSITIVE_ATTESTED=true`. Presence checks do not prove API keys,
   on-chain roles, or partner configuration are valid.
3. **Mainnet creation is not enabled.** Set `BAGS_ALLOW_PROD_LAUNCH=true` only
   after the release gates pass. The updated code treats this as an explicit
   mainnet creation opt-in, not a devnet override. Keep
   `PLATFORM_FEE_BPS_DEFAULT=0`; platform revenue is on the Bags partner rail.
4. **Live money flows have not been exercised.** Verify the partner config,
   manager delegation, owner signing, fee accrual, and partner claiming with a
   controlled launch before opening general token creation. No token creation,
   private-key retrieval, funding, or claim transaction was performed by this review.

The local `.env.production.local` is incomplete; it is not a faithful copy of
Vercel Production. Its missing secret names are `BETTER_AUTH_SECRET`,
`GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`,
`BAGS_API_KEY`, `BAGS_WEBHOOK_SECRET`, `BAGS_PARTNER_CONFIG_KEY`, `HELIUS_RPC_URL`,
`HELIUS_WEBHOOK_AUTH_TOKEN`, `SOLANA_PAYOUT_KEYPAIR`, `SOLANA_MANAGER_KEYPAIR`,
`CRON_SECRET`, and `IDEMPOTENCY_KEY_SECRET`. Do not infer production secrets are
missing from this local check or paste private keys into chat.

## Fixes made in this review

- Boolean env flags parse `false` as false and reject ambiguous values.
- Mainnet token creation requires explicit opt-in, partner configuration, a
  manager signer, and clear kill switches. Production-key launches cannot be
  redirected through a devnet override.
- Live launch claimers are scored, non-excluded, recently indexed contributors
  with Bags-linked GitHub identities. Their allocations total exactly 10,000
  BPS; unlinked and zero-BPS identities are skipped. No contributor allocation
  goes to the server pool wallet.
- The server funds config creation, while the owner's linked wallet is explicitly
  supplied as the Bags config admin and signs the final token launch.
- A shared per-project lock serializes API and wizard launch preparation.
- The direct contributor manifest is persisted before the unsigned launch is
  returned. Completion checks a successful confirmed transaction, expected fee
  payer and pool configuration, DBC invocation, and creation of the expected mint.
- Live legacy admin launches are blocked; use `/launch` for owner signing.
- Prepared, paused, and killed projects are excluded from rebalance scheduling.
- The wizard displays the 25% Bags partner rate separately from the zero legacy
  contributor-envelope deduction and submits cadence/claimer-cap selections.
- Partner preflight checks the config PDA, program owner, partner wallet, 2,500
  BPS rate, and the signer needed for automatic partner claims.
- Restored ESLint/plugin compatibility and removed a lint error in an existing
  test. Database errors no longer include credential-bearing connection URLs.

## Debut procedure

1. Resolve the blockers above and deploy the verified commit. Confirm both
   domains' canonical origin, GitHub OAuth callback, GitHub App webhook, and
   `BETTER_AUTH_URL` agree. Use the existing Vercel project rather than creating
   another deployment with the same name.
2. Apply existing DB migrations to the intended production database; this change
   introduces no schema migrations. Check the GitHub App installation includes
   `SYMBaiEX/GitShipt` and that the launcher has repository admin access.
3. Have each intended contributor link their GitHub identity on Bags. The debut
   launch needs at least one scored, linked contributor. Confirm the actual
   linked GitHub handles for SYMBiEX and dEXploarer rather than assuming display
   names are account names.
4. Sign in with GitHub, open `/launch`, select the GitShipt repo, set the token
   metadata and initial-buy amount, and save a draft. For the debut, use at most
   15 claimers. The SDK requires lookup-table preparation beyond that size;
   this release rejects larger live manifests explicitly.
5. Install the GitHub App if needed and use the project's reindex action
   (`POST /api/projects/{id}/reindex` with a session and `Idempotency-Key`). Wait
   for indexing and leaderboard computation to complete. Launch inputs must be
   indexed within the last 24 hours.
6. If a previous demo project is `simulated_live`, use the existing authenticated
   admin promotion flow to reset it to draft first. Do not treat its stub mint
   as a real token. An older `launch_configured` pool-only project needs manual
   reconciliation; this release refuses to reuse an unsafe manifest.
7. Confirm `BAGS_PARTNER_CONFIG_KEY` is the on-chain partner config PDA for
   `BAGS_PARTNER_WALLET`, its rate is 2,500 BPS, and the fee-claim signer matches
   that wallet. Fund only the intended hot config payer and launch wallet with
   the required SOL. Keep cold treasury keys outside Vercel.
8. Open the saved draft, connect/link the owner wallet, and review the token,
   recipients, initial buy, fees, and mainnet cluster. The wallet simulates,
   signs, and broadcasts the launch. The agent does not sign it for you.
9. Complete the post-launch manager delegation in the owner wallet. Verify its
   on-chain state, the persisted contributor slots, and the initial 24-hour
   schedule. Verify the debut before inviting other projects to launch.
10. Observe the first snapshot and BPS rebalance, then verify contributor claims
    on Bags and GitShipt partner claim stats/receipts in `/admin/fees`. Revenue
    depends on trading activity and accrual; a configured rate is not revenue.

## Recovery and verification limits

Observed verification for this revision:

- Typecheck, lint, theme lint, and production build: pass.
- Unit/integration suite: 280 tests pass across 49 files.
- Playwright: 4 pass, 7 skipped because DB fixtures are not supplied.
- Dependency security audit: fails; still a release blocker.
- Production strict health before deployment: HTTP 503 for missing Sensitive
  attestation; required credential names present, DB and Redis reachable.
- Host verification used Bun 1.4.2 and Node 26.10.0; CI remains pinned to
  Bun 1.3.13 and the application declares Node 22. Vercel currently has Node 24
  selected. Reconcile the production runtime pin before release.

Config creation and DB checkpointing are separate external operations. If an
on-chain config succeeds and its DB write fails, stop and reconcile that mint
and manifest rather than generating a replacement blindly. Manager rebalances
do not onboard new recipients automatically; project-owner admin updates remain
necessary for new contributors. Existing API response caching can return an
expired unsigned transaction when a client reuses a completed preparation key;
the wizard supplies a fresh key on each attempt.

Validation covers source review, typecheck, lint, theme lint, unit/integration
tests, build, dependency audit, and public browser/API checks. Authenticated
launch, production DB migrations, real signatures, and live fee claims require
separate operational verification. See `launch-review.html` for the short report.
