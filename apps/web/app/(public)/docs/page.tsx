import { Suspense } from "react";
import type { Metadata } from "next";
import { CopyButton } from "@/components/shared";
import { DocSection } from "./_components/DocSection";

export const metadata: Metadata = {
  title: "Docs · GitShipt",
  description:
    "How GitShipt scoring, payouts, wallet linking, embedding, and security work.",
};

const TOC: Array<{ id: string; title: string }> = [
  { id: "what-is-gitshipt", title: "What is GitShipt?" },
  { id: "scoring", title: "How scoring works" },
  { id: "payouts", title: "Daily payout pipeline" },
  { id: "wallet-linking", title: "Linking your wallet (SIWS)" },
  { id: "embedding", title: "Embedding the token widget" },
  { id: "security", title: "Security baseline" },
];

const EMBED_SNIPPET = `<iframe
  src="https://gitshipt.com/embed/r/{org}/{repo}"
  width="380"
  height="360"
  style="border:0;border-radius:12px;color-scheme:light dark"
  loading="lazy"
></iframe>`;

/**
 * Public docs page. Hardcoded sections rather than markdown-from-disk for
 * v0 — keeps the build deterministic, lets us co-locate the copy with the
 * components that link to it, and ships zero extra client JS.
 */

export default function DocsPage() {
  return (
    <Suspense fallback={null}>
      <DocsPageContent />
    </Suspense>
  );
}

async function DocsPageContent() {
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <nav aria-label="Docs sections" className="flex flex-col gap-1">
          <span className="px-2 pb-2 text-label-sm uppercase text-fg-muted">
            Contents
          </span>
          {TOC.map(({ id, title }) => (
            <a
              key={id}
              href={`#${id}`}
              className="gb-route-link gb-route-link-inactive rounded-md border px-2 py-1.5 text-label-md text-fg-secondary hover:text-fg"
            >
              {title}
            </a>
          ))}
        </nav>
      </aside>

      <article className="flex max-w-prose flex-col gap-12">
        <header className="flex flex-col gap-3">
          <h1 className="text-headline-lg text-fg">GitShipt documentation</h1>
          <p className="text-body-lg text-fg-secondary">
            The mechanics behind the launchpad. How contributions become tokens,
            how tokens become payouts, and how to embed the widget anywhere.
          </p>
        </header>

        <DocSection id="what-is-gitshipt" title="What is GitShipt?">
          <p>
            GitShipt turns any GitHub repository into a tradeable Bags.fm token
            whose lifetime fees flow back to the people who actually build it. A
            repo owner connects GitHub, picks a payout config, and we mint a
            token that&apos;s tied 1:1 to that repo. As the token trades, fees
            accumulate; once a day at 00:30 UTC the top contributors receive
            on-chain SOL transfers proportional to their share of the
            leaderboard.
          </p>
        </DocSection>

        <DocSection id="scoring" title="How scoring works">
          <p>
            Each contributor&apos;s score is a weighted sum of GitHub activity
            over a rolling 30-day window with linear time decay (a contribution
            today counts in full; a contribution 29 days ago counts at 1/30).
            The default formula:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 text-mono-sm text-fg">
            {
              "score = 3.0 × PRs\n      + 1.0 × commits\n      + 1.5 × reviews\n      + 0.5 × issues\n      + 0.2 × log10(1 + netLines)"
            }
          </pre>
          <p>
            Bots are excluded automatically. Any login matching{" "}
            <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-mono-sm text-fg">
              /^(.*-bot|dependabot|.*-ci|renovate)$/i
            </code>{" "}
            is filtered out before ranking. Project owners can override the
            regex per-project with explicit allow/block lists.
          </p>
          <p>
            Weights are mutable per-project via{" "}
            <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-mono-sm text-fg">
              scoringConfig.weights
            </code>
            ; only the top N (default 10) end up in the payout pool.
          </p>
        </DocSection>

        <DocSection id="payouts" title="Daily payout pipeline">
          <p>Two cron-driven workflows run every day:</p>
          <ul className="list-disc space-y-2 pl-5 text-body-md text-fg-secondary">
            <li>
              <span className="text-fg">00:00 UTC — snapshot.</span> Recompute
              every project&apos;s leaderboard from the last 30 days of GitHub
              events. Freeze the result into a snapshot row with a Merkle root.
            </li>
            <li>
              <span className="text-fg">00:30 UTC — payout.</span> For each
              snapshot, claim accrued Bags fees, then distribute lamports to the
              top 10 according to the tier weights{" "}
              <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-mono-sm text-fg">
                [0.30, 0.20, 0.15, 0.05 × 7]
              </code>
              . Contributors claim through Bags with their own wallet; GitShipt
              does not dispatch or custody contributor SOL.
            </li>
          </ul>
          <p>
            Contributors without a Bags-linked GitHub identity are skipped until
            the project owner updates the Bags claimer set. No GitShipt escrow
            balance is created.
          </p>
        </DocSection>

        <DocSection id="wallet-linking" title="Wallet attestation (SIWS)">
          <p>
            Earnings are addressed to GitHub usernames at scoring time. To
            receive them on-chain, contributors use Bags:
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-body-md text-fg-secondary">
            <li>
              Open Bags with the GitHub identity that appears on the
              leaderboard.
            </li>
            <li>
              Connect a Solana wallet and sign the Bags claim transaction.
            </li>
            <li>
              GitShipt keeps the leaderboard and snapshot audit trail in sync
              while Bags owns claim custody.
            </li>
          </ol>
          <p>
            You can link multiple wallets per account but only one is the
            primary recipient at any given time.
          </p>
        </DocSection>

        <DocSection id="embedding" title="Embedding the token widget">
          <p>
            Every project ships an embeddable token card at{" "}
            <code className="text-mono-sm text-fg">
              /embed/r/{`{org}`}/{`{repo}`}
            </code>
            . The route uses a stripped layout (transparent body, no
            sidebar/footer,{" "}
            <code className="text-mono-sm text-fg">robots: noindex</code>), so
            iframes render only the widget. Default size is{" "}
            <span className="text-mono-sm text-fg">380×360</span>.
          </p>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 pr-12 text-mono-sm text-fg">
              {EMBED_SNIPPET}
            </pre>
            <span className="absolute right-2 top-2">
              <CopyButton value={EMBED_SNIPPET} label="Copy embed snippet" />
            </span>
          </div>
          <p>
            The Share dropdown in any project header has a one-click
            &ldquo;Embed&rdquo; action that copies this snippet with the current
            origin pre-filled.
          </p>
        </DocSection>

        <DocSection id="security" title="Security baseline">
          <ul className="list-disc space-y-2 pl-5 text-body-md text-fg-secondary">
            <li>
              <span className="text-fg">HMAC-signed webhooks.</span> Every
              inbound GitHub webhook is verified against the installation&apos;s
              shared secret; mismatches are dropped.
            </li>
            <li>
              <span className="text-fg">Sensitive env vars.</span> Treasury
              keys, GitHub App private keys, and OAuth secrets are scoped to
              server-only code paths and never reach the browser bundle.
            </li>
            <li>
              <span className="text-fg">Append-only audit log.</span> Every
              administrative action (kill, force-payout, fee change) writes a
              tamper-evident row with actor, reason, and target.
            </li>
            <li>
              <span className="text-fg">Kill switch.</span> A platform-wide halt
              flag stops every payout in flight and blocks new launches without
              requiring a redeploy.
            </li>
            <li>
              <span className="text-fg">Hot wallet caps.</span> The signing
              wallet holds only the next ~24 hours of expected payouts; the rest
              stays in cold custody.
            </li>
          </ul>
        </DocSection>
      </article>
    </div>
  );
}
