import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection } from "@/app/legal/_components/LegalSection";

export const metadata: Metadata = {
  title: "Terms of Service · GitShipt",
  description:
    "Terms governing use of GitShipt — a Solana token launchpad that pays trading fees back to GitHub repository contributors.",
};

const LAST_UPDATED = "2026-04-26";

/**
 * Terms of Service — long-form copy specific to GitShipt's operating model:
 * Solana launches, daily contributor payouts via Bags.fm, GitHub OAuth + SIWS.
 */

export default function TermsPage() {
  return (
    <Suspense fallback={null}>
      <TermsPageContent />
    </Suspense>
  );
}

async function TermsPageContent() {
  return (
    <article className="mx-auto flex max-w-prose flex-col gap-10 pb-16">
      <header className="flex flex-col gap-3">
        <span className="text-label-sm uppercase text-fg-muted">Legal</span>
        <h1 className="text-headline-lg text-fg">Terms of Service</h1>
        <p className="text-mono-sm text-fg-muted">
          Last updated {LAST_UPDATED}
        </p>
        <p className="text-body-md text-fg-secondary">
          These terms govern your use of GitShipt, a hackathon-stage launchpad
          that mints Solana tokens for open-source repositories and routes a
          share of trading fees to the repository&apos;s top contributors. Read
          carefully before launching a project or linking a wallet.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        <LegalSection index={1} title="Acceptance and scope">
          <p>
            By signing in, linking a GitHub repository, linking a Solana wallet,
            or trading a token launched on GitShipt, you accept these Terms. If
            you do not agree, do not use the service.
          </p>
          <p>
            GitShipt is provided strictly on an &ldquo;as is&rdquo; and
            &ldquo;as available&rdquo; basis with no warranty of any kind. These
            Terms apply to the website at gitshipt.com, all subdomains, and any
            associated APIs or webhooks operated by the GitShipt team.
          </p>
        </LegalSection>

        <LegalSection index={2} title="What GitShipt does">
          <p>
            GitShipt lets a GitHub repository owner mint a token whose metadata,
            branding, and royalty splits are bound to that repository. Tokens
            are launched through the Bags.fm SDK on the Solana network.
          </p>
          <p>
            When the token trades, a configured share of the swap fees is
            allocated to the repository&apos;s top contributors through
            Bags-native fee sharing, ranked by an automated scoring workflow
            that runs on a daily cadence. Contributors claim eligible fees
            directly through Bags.
          </p>
        </LegalSection>

        <LegalSection index={3} title="Eligibility">
          <p>
            You must be at least the age of legal majority in your jurisdiction
            and have a valid GitHub account in good standing to use GitShipt.
            You must not be located in, a resident of, or accessing the service
            from any country or region subject to comprehensive U.S. sanctions,
            and you must not be a person designated on any U.S. or applicable
            international sanctions list.
          </p>
          <p>
            You are responsible for compliance with all laws that apply to you,
            including local regulations on token issuance, trading, and tax
            reporting.
          </p>
        </LegalSection>

        <LegalSection index={4} title="Token launches">
          <p>
            By initiating a launch you authorize GitShipt to mint a Bags.fm
            token bound to the GitHub repository you select and to register the
            resulting royalty split with the repository&apos;s top contributors
            as recipients. You retain full ownership of your repository, its
            source code, and its license. GitShipt takes no equity in your
            project and acquires no rights to your code.
          </p>
          <p>
            You represent that you have the authority to launch a token
            representing the repository in question and that the
            repository&apos;s contents do not violate any third party&apos;s
            rights. You are solely responsible for the repository, its branding,
            and any communications you make about the token.
          </p>
        </LegalSection>

        <LegalSection index={5} title="Trading fees and payouts">
          <p>
            GitShipt does not custody user funds. Trades occur on-chain through
            Bags.fm liquidity. Contributor fee allocations are registered with
            Bags, and contributors claim eligible fees directly through Bags.
            GitShipt may run automated workflows to refresh contributor basis
            points and claim GitShipt partner fees, but those workflows do not
            take custody of contributor balances.
          </p>
          <p>
            We do not promise any specific payout amount, claim availability,
            refresh cadence beyond &ldquo;daily best effort,&rdquo; or
            transaction inclusion latency. Bags API availability, on-chain
            failures, congestion, or RPC outages may delay leaderboard updates,
            BPS rebalances, partner fee claims, or contributor claims.
          </p>
        </LegalSection>

        <LegalSection index={6} title="Permissible use">
          <p>You agree not to:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              launch tokens for repositories you do not own or have permission
              to represent;
            </li>
            <li>
              impersonate another project, person, or organization, including by
              reusing names, logos, or branding;
            </li>
            <li>
              manipulate trading volume, wash trade, or otherwise inflate fee
              accrual to redirect payouts;
            </li>
            <li>spam the platform with low-effort or duplicate launches;</li>
            <li>
              use the service to facilitate illegal activity, fraud, or evasion
              of sanctions; or
            </li>
            <li>
              attempt to bypass authentication, rate limiting, the kill switch,
              or any other security control.
            </li>
          </ul>
        </LegalSection>

        <LegalSection index={7} title="Pause and kill rights">
          <p>
            GitShipt reserves the right, at its sole discretion, to pause or
            permanently kill any project, suspend any account, freeze pending
            payouts, or activate the platform-wide kill switch — including in
            response to suspected abuse, security incidents, legal demands, or
            violation of these Terms.
          </p>
          <p>
            A kill action is not a refund. Tokens already minted on Solana
            remain on-chain and are not unwound. Pending Bags fee-share
            allocations may be paused, redirected to remaining eligible
            contributors, returned to the project treasury, or held pending
            resolution, in our reasonable discretion.
          </p>
        </LegalSection>

        <LegalSection
          index={8}
          title="No financial advice, no securities, no guarantees"
        >
          <p>
            Nothing in GitShipt constitutes financial, investment, tax, or legal
            advice. Tokens launched on GitShipt are not offered as securities,
            and no statement on the platform should be read as a solicitation to
            invest. We make no representation about the value, liquidity, or
            future performance of any token.
          </p>
          <p>
            Contributor scores, leaderboards, projected payouts, and historical
            statistics are informational only. Past payouts do not predict
            future payouts.
          </p>
        </LegalSection>

        <LegalSection index={9} title="Network and demo-mode disclaimer">
          <p>
            GitShipt may run in local, devnet, testnet, or mainnet mode
            depending on deployment configuration. Non-mainnet SOL and tokens
            have no monetary value, and any &ldquo;USD&rdquo; figure shown for a
            non-mainnet project is a synthetic display value.
          </p>
          <p>
            Because GitShipt is hackathon-stage software, the database, the
            indexer, and the on-chain state may be reset, migrated, or wiped at
            any time without notice outside explicitly announced production
            environments. Mainnet activation is controlled by production
            readiness gates and is not implied by a local or preview deployment.
          </p>
        </LegalSection>

        <LegalSection
          index={10}
          title="Indemnity, limitation of liability, governing law"
        >
          <p>
            You agree to indemnify and hold harmless the GitShipt team and
            contributors from any claim, loss, or expense arising from your use
            of the service, your launches, your repository&apos;s contents, or
            your violation of these Terms.
          </p>
          <p>
            To the maximum extent permitted by law, GitShipt and its
            contributors are not liable for any indirect, incidental,
            consequential, or punitive damages, or for any loss of tokens,
            missed payouts, RPC failures, or third-party outages (including
            GitHub, Bags.fm, Helius, Vercel, and Neon). Aggregate liability for
            any direct claim is capped at one hundred U.S. dollars (USD 100).
          </p>
          <p>
            These Terms are governed by the laws of the State of Delaware, USA,
            without regard to conflict-of-laws principles. Any dispute that
            cannot be resolved informally shall be settled by binding individual
            arbitration seated in Delaware. You waive any right to participate
            in a class action.
          </p>
        </LegalSection>

        <LegalSection index={11} title="Modifications">
          <p>
            We may update these Terms at any time. The &ldquo;last
            updated&rdquo; date at the top of this page reflects the most recent
            revision. Material changes will be announced in the product or via
            the project repository. Your continued use of GitShipt after a
            change constitutes acceptance of the updated Terms.
          </p>
        </LegalSection>

        <LegalSection index={12} title="Contact">
          <p>
            Questions, security reports, and abuse complaints:{" "}
            <a
              href="mailto:legal@gitshipt.com"
              className="text-fg underline-offset-4 hover:underline"
            >
              legal@gitshipt.com
            </a>
            . Bugs, feature requests, and source-level discussion happen in the
            public repository at{" "}
            <Link
              href="https://github.com/SYMBaiEX/gitshipt"
              target="_blank"
              rel="noreferrer noopener"
              className="text-fg underline-offset-4 hover:underline"
            >
              github.com/SYMBaiEX/gitshipt
            </Link>
            .
          </p>
        </LegalSection>
      </div>
    </article>
  );
}
