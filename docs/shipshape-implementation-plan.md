# Shipshape spine — implementation plan

Companion to `docs/shipshape-design.md`. The design doc is the contract;
this is the commit-by-commit landing strategy. Each commit below is **atomic**:
self-contained, independently testable, independently revertable, and preserves
v0 behavior until the explicit wiring commit lands.

Status: **proposed, awaiting user review**. No code lands until the order and
shape of these commits is approved.

---

## Principles

1. **v0 protection.** Every commit in PR 1 must keep `formulaVersion: "v0"`
   projects scoring, indexing, and paying out exactly as they do today. v1
   behavior turns on **only** when a project's `scoringConfig.formulaVersion`
   is `"v1"`.
2. **Pure before wired.** Pure-function commits (no I/O, fully testable in
   isolation) land before the wiring commits that integrate them into
   workflows. A pure commit can be reverted without affecting any caller
   because no caller exists yet.
3. **One concern per commit.** A commit changes one logical thing. Tests for
   that thing land in the same commit.
4. **No surface without substance.** A public route that renders shipshape
   only ships after the generator is tested. A check that displays cap
   status only ships after the cap logic is tested.
5. **Dogfood last.** GitShipt's own shipshape.md, CI workflow, and README
   badge are the final commits in PR 1. They prove the spine works against
   a real repo (this one).
6. **Honesty fix only after v1 is real.** `/docs/page.tsx` updates to publish
   v1 truth ship after the wiring commits — so the public docs always describe
   behavior that actually exists.

## Dependency graph

```text
   (DONE)  18: schema migration  ──┐
                                   │
                                   ▼
   ┌─── pure functions (independent, no behavior change) ───┐
   │                                                          │
   │  19: lib/scoring/v1                  20: lib/scoring/alignment
   │  21: lib/scoring/penalty            22: lib/scoring/pacing
   │  23: lib/github/indexer/reviews     24: lib/github/indexer/squash
   │  25: lib/github/indexer/coauthor    26: lib/github/indexer/trivial
   │  27: lib/agents/shipshape           28: lib/agents/logbook
   │  29: lib/badge/svg                  30: lib/orgs/inheritance
   │                                                          │
   └──────────────────────────┬───────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
  ┌── routes/UI ──┐    ┌── ingest ──┐         ┌── wiring ──┐
  │                │    │             │         │             │
  │ 31: badge svg  │    │ 33: slash   │         │ 36: scoring │
  │     route     │    │     parser  │         │     dispatch│
  │ 32: shipshape │    │ 34: slash   │         │ 37: indexer │
  │     +logbook  │    │     webhook │         │     dispatch│
  │     routes    │    │ 35: ci      │         │ 38: align   │
  │ (cross-repo,  │    │     ingest  │         │     in lb   │
  │  org dash)    │    │             │         │ 39: penalty │
  │                │    │             │         │     enforce │
  │                │    │             │         │ 40: payout  │
  │                │    │             │         │     gates   │
  └────────────────┘    └─────────────┘         │ 41: pacing  │
                                                 │     in lb   │
                                                 └─────────────┘
                                                       │
                                                       ▼
                                          ┌── async + dogfood ──┐
                                          │                      │
                                          │ 42: processDraftQueue│
                                          │ 43: gh-bot over-cap  │
                                          │     comment + check  │
                                          │ 44: GitShipt own     │
                                          │     shipshape.md     │
                                          │ 45: GitShipt CI yml  │
                                          │ 46: GitShipt badge   │
                                          │ 47: docs honesty fix │
                                          └──────────────────────┘
```

## Commit plan

Numbered to continue the existing branch sequence (commit 18 is the schema
migration, already landed).

### Phase 1 — Pure foundations (12 commits, independent, parallel-safe)

Each commit adds new code, exports new functions, ships tests. **No existing
code path is modified.** Reverting any of these removes only the new exports.

| #   | Title                | Files                                                                | Tests                 | What it gives                                                                                                                                                |
| --- | -------------------- | -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 19  | scoring/v1 — formula | `lib/scoring/v1.ts`                                                  | unit, property        | Pure `computeRawScoreV1(inputs, weights, decayMul)`                                                                                                          |
| 20  | scoring/alignment    | `lib/scoring/alignment.ts`                                           | unit                  | Pure `computeAlignmentFactor(...)` + `alignmentMultiplier(...)`                                                                                              |
| 21  | scoring/penalty      | `lib/scoring/penalty.ts`                                             | unit                  | `activePenaltyFor(contributorId, projectId, ts)` + multipliers                                                                                               |
| 22  | scoring/pacing       | `lib/scoring/pacing.ts`                                              | unit                  | `applyPerDayCap(merged_prs, cap, allowance)` returning credited+deferred                                                                                     |
| 23  | indexer/reviews      | `lib/github/indexer/reviews.ts`                                      | unit (mocked Octokit) | `fetchReviewsForPr(octo, owner, repo, prNumber, floor)` returning `(reviews, substantive_score)` per reviewer, with head-SHA delta check for iteration bonus |
| 24  | indexer/squash       | `lib/github/indexer/squash.ts`                                       | unit                  | `isSquashCommit(commit, mergedPrs)` — detects squash-merge by SHA + message pattern                                                                          |
| 25  | indexer/coauthor     | `lib/github/indexer/coauthor.ts`                                     | unit                  | `parseCoAuthorTrailers(message)` + noreply-pattern user resolver                                                                                             |
| 26  | indexer/trivial      | `lib/github/indexer/trivial.ts`                                      | unit                  | `isTrivialCommit(files)` — lockfile/dist/whitespace filter                                                                                                   |
| 27  | agents/shipshape     | `lib/agents/shipshape.ts` + `lib/agents/templates/shipshape.tmpl.md` | unit (snapshot)       | `generateShipshape(project, scoringConfig, alignmentConfig, agentRoutingPolicy, communityLinks)`                                                             |
| 28  | agents/logbook       | `lib/agents/logbook.ts` + template                                   | unit (snapshot)       | `generateLogbook(projectState, topContributors, recentAreas, hotIssues)`                                                                                     |
| 29  | badge/svg            | `lib/badge/svg.ts`                                                   | unit (snapshot)       | `renderTrackedBadge(orgRepo)` — pure SVG string                                                                                                              |
| 30  | orgs/inheritance     | `lib/orgs/inheritance.ts`                                            | unit                  | `resolveProjectDefaults(orgRow, scoringConfig?, alignmentConfig?, ...)` snapshotting org defaults at project create                                          |

**After Phase 1**: typecheck clean, all tests pass, no behavior change.

### Phase 2 — Surface (5 commits, independent of each other, depend on Phase 1)

Each ships a new route or page. Renders data from DB. v0 projects continue
working unchanged.

| #   | Title                                     | Files                                                                                                               | Tests                             | Depends on |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------- |
| 31  | route: badge SVG                          | `app/badge/r/[org]/[repo].svg/route.ts`                                                                             | e2e (request → svg response)      | 29         |
| 32  | route: shipshape + logbook + runbook.json | `app/r/[org]/[repo]/shipshape.md/route.ts`, `…/logbook.md/route.ts`, `app/api/r/[org]/[repo]/runbook.json/route.ts` | e2e                               | 27, 28     |
| 33  | page: contributor cross-repo view         | `app/dashboard/me/contributions/page.tsx`                                                                           | unit (rendering with seeded data) | schema     |
| 34  | page: org dashboard read-only             | `app/dashboard/orgs/[ghLogin]/page.tsx`                                                                             | unit                              | schema, 30 |
| 35  | page: org settings                        | `app/dashboard/orgs/[ghLogin]/settings/page.tsx` (read-only display in PR 1; editor in PR 3)                        | unit                              | 30         |

**After Phase 2**: shipshape + logbook + badge + runbook.json publicly live.
Cross-repo + org dashboards visible. Scoring still v0 — they render based on
v0 data for v0 projects.

### Phase 3 — Ingest (3 commits, depend on Phase 1 + schema)

Endpoints and webhooks that let external systems write to our DB. Behind
proper auth. No scoring-level effects yet because nothing in computeLeaderboard
reads them yet.

| #   | Title                  | Files                                                                                                                                   | Tests                | Depends on |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| 36  | slash-command parser   | `lib/github/slash-commands.ts`                                                                                                          | unit                 | —          |
| 37  | webhook: issue_comment | `app/api/webhooks/github/issue_comment/route.ts`                                                                                        | e2e (HMAC + payload) | 36, 21     |
| 38  | route: ci-event        | `app/api/projects/[projectId]/ci-event/route.ts` + `lib/ci-events/auth.ts` (OIDC + HMAC) + `lib/ci-events/handlers.ts` (per-event-type) | e2e (mocked OIDC)    | 21         |

**After Phase 3**: maintainers can `/gitshipt flag/ban/clear/...` and CI can
post events. `contributor_penalties` and `contributors.inputs.ci.*` get
populated. **But scoring still ignores them** — wiring is Phase 4.

### Phase 4 — Wiring (5 commits, sequence-dependent)

This is where v1 behavior turns on for `formulaVersion: "v1"` projects.
Each commit modifies exactly one workflow or step, behind a `formulaVersion`
check that defaults to v0.

| #   | Title                                                                 | Files                                                                        | Tests                                                     | Depends on         |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| 39  | wire: scoring dispatch in computeLeaderboard                          | `workflows/computeLeaderboard.ts`                                            | unit (v0 path unchanged, v1 path uses v1 formula + decay) | 19                 |
| 40  | wire: indexer dispatch in indexProjectDeltas                          | `workflows/indexProjectDeltas.ts` (calls Phase 1 indexer/\* helpers when v1) | unit (mocked Octokit)                                     | 23, 24, 25, 26, 22 |
| 41  | wire: alignment + pacing in computeLeaderboard                        | `workflows/computeLeaderboard.ts`                                            | unit                                                      | 20, 22, 39         |
| 42  | wire: penalty enforcement (yellow alignment, red/black BPS exclusion) | `workflows/computeLeaderboard.ts` + `workflows/rebalanceBps.ts`              | unit                                                      | 21, 41             |
| 43  | wire: community-verified claimer gate                                 | `workflows/rebalanceBps.ts`                                                  | unit                                                      | schema, 42         |

**After Phase 4**: v1 wiring is in place. New projects default to v1 and use
the new behavior. **Existing projects still on v0** (their schema rows still
have `formulaVersion: "v0"`) continue to use the v0 path. The cut-over is
the next commit.

### Phase 4.5 — v0 → v1 promotion (1 commit, design §11)

Single SQL migration that promotes every existing project from v0 to v1 in
one cut-over. Lands AFTER all Phase 4 wiring is verified, so projects
flipping to v1 immediately get the new behavior.

| #   | Title                              | Files                                              | Tests                                                                                                        | Depends on         |
| --- | ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ |
| 44  | db: 0021_promote_v0_to_v1 backfill | `apps/web/db/migrations/0021_promote_v0_to_v1.sql` | unit (verify v1 fields populated for promoted projects), e2e (one v0 project rendered as v1 after migration) | 39, 40, 41, 42, 43 |

The backfill:

- `UPDATE projects SET scoring_config = jsonb_set(scoring_config, '{formulaVersion}', '"v1"')` for all rows where current `formulaVersion = 'v0'`.
- Same UPDATE adds the v1 config defaults: `perPrCommitCap = 5`,
  `perWindowPrCap = 10`, `draftQueueEnabled = true`,
  `draftAutoReviewDelayHours = 24`, `trivialCommitFilter = true`,
  `substantiveReviewFloor = {minBodyChars: 200, minAnchoredComments: 1}`,
  weights for `merges = 2.0`, `reviewSubstantiveScore = 1.0`,
  `coAuthored = 0.5`.
- `alignmentConfig`, `agentRoutingPolicy`, `communityLinks` remain NULL —
  v1 code paths short-circuit when these are null (alignment forced to
  "informational" mode, routing defaults to treasury, no community surface).
  Owners populate via PR 3 configurator at their pace.

The v0 dispatch path remains in code as a per-project kill-switch. Nothing
auto-sets `formulaVersion` back to `'v0'` — only an admin can, by editing
`scoringConfig` directly.

**After Phase 4.5**: every project on the platform is running v1.

### Phase 5 — Async + non-intrusive UX (3 commits)

The auto-review pipeline + the gitshipt-bot's contributor-facing comments and
checks. None of these are economically load-bearing — they enhance the UX
of the v1 system already wired in Phase 4.

| #   | Title                                        | Files                                                            | Tests                      | Depends on |
| --- | -------------------------------------------- | ---------------------------------------------------------------- | -------------------------- | ---------- |
| 45  | workflow: processDraftQueue                  | `workflows/processDraftQueue.ts` + cron entry in `vercel.json`   | unit (mocked Octokit + DB) | 22, 36     |
| 46  | gh-bot over-cap comment + score-status check | `lib/github/bot-comments.ts` + integration in indexProjectDeltas | unit                       | 22, 40     |
| 47  | gh-bot penalty-status check                  | `lib/github/bot-comments.ts` (extend)                            | unit                       | 21, 42     |

**After Phase 5**: contributors see status checks on their PRs and helpful
bot comments when over cap. Drafts left open for >24h get auto-reviewed.

### Phase 6 — Dogfood + honesty (4 commits, end of PR 1)

Final commits prove the spine works on this repo and align the public docs
with reality.

| #   | Title                                                       | Files                                 | Depends on          |
| --- | ----------------------------------------------------------- | ------------------------------------- | ------------------- |
| 48  | dogfood: GitShipt own shipshape.md at repo root             | `shipshape.md`                        | 27, 32              |
| 49  | dogfood: GitShipt own .github/workflows/gitshipt-report.yml | workflow file                         | 38                  |
| 50  | dogfood: GitShipt own README badge                          | `README.md` (additive)                | 31                  |
| 51  | docs: honesty fix at /docs                                  | `apps/web/app/(public)/docs/page.tsx` | all of Phase 4 + 44 |

**After Phase 6**: PR 1 ships. Branch is mergeable.

## Commit batching for review

If reviewer fatigue is a concern, group commits into reviewable chunks:

- **Review chunk A — pure foundations (12 commits, ~1500 lines + tests).**
  Commits 19–30. No behavior change; reviewer can verify each export does what
  it claims via the tests.
- **Review chunk B — surface + ingest (8 commits, ~1200 lines).**
  Commits 31–38. New routes/webhooks/UI; reviewer can verify auth, rendering,
  Zod validation.
- **Review chunk C — wiring + cut-over + async (9 commits, ~900 lines).**
  Commits 39–47. v1 wiring, the v0→v1 backfill (commit 44), draft-queue
  worker, gh-bot UX. Reviewer can run end-to-end on a fixture project and
  verify the cut-over moves all v0 projects cleanly.
- **Review chunk D — dogfood + docs (4 commits, ~150 lines).**
  Commits 48–51. Sanity check.

Total: 33 commits added on top of the 8 already on the branch (= 41 total).
Estimated 18–24 working hours of focused work.

## Out-of-scope for PR 1 (held for PR 2 / PR 3)

- **Launch state machine wiring beyond schema** — `pending_install` →
  `awaiting_pr_merge` → `ready_to_launch` → `launched` transitions, the install
  PR creation flow, the install-merge webhook handler. PR 2.
- **Format adapters** (CLAUDE.md / .cursor/rules / copilot-instructions). PR 2.
- **README badge insertion logic in the install PR.** PR 2 (the badge SVG
  route is in PR 1; the install-PR-side insertion is PR 2).
- **Dashboard configurator UI** for alignment policy / agent routing /
  install button. PR 3.
- **Org default-config editor UI** beyond the read-only display. PR 3.
- **`gitshipt/report-action@v1` reusable action** (lives in a separate
  repo). PR 2 has the stub workflow that calls it; the action repo itself
  is independent.

(Removed: grace-window enforcement. Per design §11, existing
projects auto-promote to v1 in commit 44 — no grace window, consistent
with `SPEC.md`'s no-grace-windows rule.)

## How to verify each commit before pushing

For commits in Phase 1: `bun run typecheck && cd apps/web && bun run vitest run path/to/test.ts`.

For commits in Phase 2 / 3: as above plus `bun run e2e -g "the matching describe pattern"` once Playwright fixtures are seeded.

For commits in Phase 4: as above plus a manual scenario walkthrough via
`bun run db:seed` (will need a small `seed-v1-project.mjs` script — written as
part of commit 39 to make wiring testable without a manual DB poke).

For commits in Phase 5–6: hand-test by visiting the live URL on `bun run dev`.

## Open implementation questions to resolve once, not per-commit

These are flagged in the design doc but worth pinning before code starts:

1. **`gitshipt-bot` identity for App-posted comments.** The App's
   installation token posts as `gitshipt[bot]`. This is automatic from
   GitHub when using `installationOctokit`. No new auth needed.
2. **gh-bot comment content templates.** Three templates needed:
   over-cap notice (commit 45), elevated awaiting-maintainer (commit 44),
   no-penalty-close (commit 44). Inline as constants in `bot-comments.ts`
   for v1; extract to template files only if they grow.
3. **Cron schedule for processDraftQueue.** Design doc says "every 6h" —
   add as `*/6 hours` in `vercel.json` crons in commit 44. Trigger: a
   `/api/cron/process-draft-queue` route handler.
4. **Audit log entries for slash commands.** Use existing `lib/audit.ts`
   helpers; entries written from commit 37's webhook handler.
5. **Default-org behavior for user-namespace repos.** When `gh_org_id`
   is null, the project creation flow skips org default lookup entirely.
   Already handled by the schema (column is nullable). No special case
   needed in commit 30.

## Approval gate

This plan does not start landing until reviewed. After approval, commits
land in the order above. Each commit description references this plan
section so the reviewer can map a diff back to its place.
