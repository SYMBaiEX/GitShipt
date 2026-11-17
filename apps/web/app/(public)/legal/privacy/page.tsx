import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection } from "@/app/legal/_components/LegalSection";

export const metadata: Metadata = {
  title: "Privacy Policy · GitShipt",
  description:
    "How GitShipt collects, uses, and protects your data — GitHub identifiers, linked Solana wallet addresses, and audit logs from a hackathon-stage devnet launchpad.",
};

const LAST_UPDATED = "2026-04-26";

/**
 * Privacy Policy — long-form, demo-grade copy honest about exactly
 * what GitShipt stores: GitHub OAuth identifiers + email, linked
 * Solana wallet addresses, append-only audit logs, contributor
 * scoring inputs derived from public GitHub data. No analytics.
 */

export default function PrivacyPage() {
  return (
    <Suspense fallback={null}>
      <PrivacyPageContent />
    </Suspense>
  );
}

async function PrivacyPageContent() {
  return (
    <article className="mx-auto flex max-w-prose flex-col gap-10 pb-16">
      <header className="flex flex-col gap-3">
        <span className="text-label-sm uppercase text-fg-muted">Legal</span>
        <h1 className="text-headline-lg text-fg">Privacy Policy</h1>
        <p className="text-mono-sm text-fg-muted">
          Last updated {LAST_UPDATED}
        </p>
        <p className="text-body-md text-fg-secondary">
          GitShipt is built to need as little of your data as possible. This
          policy describes exactly what we collect, why we collect it, who we
          share it with, and how you can have it deleted.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        <LegalSection index={1} title="Scope">
          <p>
            This policy covers personal data processed by the GitShipt service at
            gitshipt.com and its subdomains, including the public site, the
            dashboard, the admin console, and any GitShipt-operated webhook
            receivers or background workflows.
          </p>
          <p>
            It does not cover third-party services (GitHub, Bags.fm, Helius,
            Vercel, Neon) which have their own policies that apply to data they
            process on our behalf.
          </p>
        </LegalSection>

        <LegalSection index={2} title="Data we collect">
          <p>The complete list of personal data GitShipt stores:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong className="text-fg">GitHub identity:</strong> your GitHub
              user ID, username, avatar URL, primary public email, and the OAuth
              refresh token returned by GitHub at sign-in.
            </li>
            <li>
              <strong className="text-fg">Linked wallets:</strong> Solana wallet
              addresses (base58 public keys) you link via Sign-In With Solana.
            </li>
            <li>
              <strong className="text-fg">Contributor scoring inputs:</strong>{" "}
              aggregates derived from public GitHub data — commit counts, merged
              PR counts, review counts, file paths touched, and timestamps — for
              the repositories linked to launches.
            </li>
            <li>
              <strong className="text-fg">Audit log:</strong> records of
              administrative actions (launches, payouts, kill switch toggles,
              fee changes, role grants), each tagged with the actor&apos;s
              identifier, the action, the affected resource, and a timestamp.
            </li>
            <li>
              <strong className="text-fg">Operational telemetry:</strong>{" "}
              request logs and rate-limit counters retained for a short window
              for abuse prevention and debugging.
            </li>
          </ul>
        </LegalSection>

        <LegalSection index={3} title="Data we do not collect">
          <p>
            GitShipt does not collect payment instruments, banking information,
            off-chain financial data, government identifiers, Social Security
            numbers, biometrics, precise geolocation, or contents of private
            repositories. We do not run KYC or identity verification.
          </p>
        </LegalSection>

        <LegalSection index={4} title="How we use your data">
          <p>
            We use the data above to operate the leaderboard, compute
            contributor scores, configure Bags fee sharing, authenticate
            sessions, prevent abuse via rate limiting and
            audit review, and respond to support requests. We do not use your
            data for advertising or profiling, and we do not sell it.
          </p>
        </LegalSection>

        <LegalSection index={5} title="Sharing">
          <p>
            GitShipt shares the minimum required data with the following
            processors:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong className="text-fg">Bags.fm:</strong> token metadata,
              launch parameters, and royalty splits including recipient wallet
              addresses.
            </li>
            <li>
              <strong className="text-fg">Helius (Solana RPC):</strong> wallet
              addresses and transaction signatures for chain reads and
              submissions.
            </li>
            <li>
              <strong className="text-fg">GitHub:</strong> the GitShipt GitHub
              App reads public repository metadata for indexing under the scopes
              you grant.
            </li>
            <li>
              <strong className="text-fg">Vercel and Neon:</strong> hosting and
              database infrastructure that processes data in transit and at rest
              under their respective DPAs.
            </li>
          </ul>
          <p>
            We do not run third-party advertising networks, social pixels, or
            behavioral analytics trackers.
          </p>
        </LegalSection>

        <LegalSection index={6} title="Retention">
          <p>
            The audit log is append-only and retained indefinitely for security,
            integrity, and regulatory traceability. We cannot edit or delete
            individual audit entries.
          </p>
          <p>
            All other personal data — GitHub identifiers, linked wallets,
            scoring inputs — is deletable on request through account closure.
            On-chain transactions, including past payouts, remain on the Solana
            blockchain and cannot be removed by GitShipt.
          </p>
        </LegalSection>

        <LegalSection index={7} title="Your rights">
          <p>
            You may request access to, export of, or deletion of your personal
            data by emailing the address in the contact section below. We will
            respond within thirty days. If you are in a jurisdiction with formal
            privacy rights (EU, UK, California, etc.), those rights apply to the
            extent required by law.
          </p>
        </LegalSection>

        <LegalSection index={8} title="Security measures">
          <p>
            GitShipt applies the following controls: HMAC verification on all
            inbound webhooks, single-use SIWS nonces with short TTL, MFA prompts
            on destructive admin actions, append-only audit logging, per-route
            rate limiting via Upstash, Zod validation on every external API
            response, least-privilege role checks via a permissions layer, and
            cold separation of treasury keys (cold keys never enter Vercel).
          </p>
          <p>
            No system is perfectly secure. Report suspected vulnerabilities to
            the contact address below; we prioritize security reports.
          </p>
        </LegalSection>

        <LegalSection index={9} title="Cookies">
          <p>
            GitShipt sets one strictly necessary cookie: an authenticated session
            cookie issued by our auth layer. We do not use analytics cookies,
            advertising cookies, or third-party trackers. No consent banner is
            required for strictly necessary session cookies in most
            jurisdictions.
          </p>
        </LegalSection>

        <LegalSection index={10} title="International transfers">
          <p>
            GitShipt infrastructure is hosted in the United States (Vercel and
            Neon, US-East regions). If you access the service from outside the
            United States, you consent to the transfer of your data to and
            processing in the United States.
          </p>
        </LegalSection>

        <LegalSection index={11} title="Changes to this policy">
          <p>
            We may revise this policy from time to time. Material changes will
            be announced in the product or via the public repository at least
            seven days before they take effect. Non-material clarifications take
            effect on the date noted at the top of this page.
          </p>
        </LegalSection>

        <LegalSection index={12} title="Contact">
          <p>
            Privacy requests, deletion requests, and security reports:{" "}
            <a
              href="mailto:privacy@gitshipt.com"
              className="text-fg underline underline-offset-4"
            >
              privacy@gitshipt.com
            </a>
            . Public discussion and code-level issues:{" "}
            <Link
              href="https://github.com/SYMBaiEX/gitshipt"
              target="_blank"
              rel="noreferrer noopener"
              className="text-fg underline underline-offset-4"
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
