import { Github, Twitter } from "@repo/ui";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Building2,
  Calendar,
  Coins,
  ExternalLink,
  Globe,
  GitFork,
  MapPin,
  Users,
  Wallet,
} from "lucide-react";
import { Badge, Button } from "@repo/ui";
import { getContributorProfile } from "@/lib/queries/discovery";
import { getGitHubUser, type GitHubUserProfile } from "@/lib/github/users";
import { formatScore, formatSol } from "@repo/lib";
import { getAuthSession } from "@/lib/auth/session";
import { getMyLinkedWallets } from "@/lib/queries/dashboard";
import { ProjectsContributedTo } from "./_components/ProjectsContributedTo";
import { EarningsHistory } from "./_components/EarningsHistory";

type Params = Promise<{ username: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { username } = await params;
  const [profile, gh] = await Promise.all([
    getContributorProfile(username),
    getGitHubUser(username),
  ]);
  if (!profile && !gh) {
    return { title: `@${username}` };
  }
  const name = gh?.name ?? profile?.ghUsername ?? username;
  return {
    title: `${name} (@${username})`,
    description: gh?.bio
      ? gh.bio
      : `Earnings, projects, and contributions for @${username} on GitShipt.`,
  };
}

export default function ContributorProfilePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ContributorProfilePageContent params={params} />
    </Suspense>
  );
}

async function ContributorProfilePageContent({ params }: { params: Params }) {
  const { username } = await params;
  const [profile, gh, session] = await Promise.all([
    getContributorProfile(username),
    getGitHubUser(username),
    getAuthSession(),
  ]);

  // 404 only when neither GitHub knows them nor we have any contributor row.
  // Real GitHub users without a contribution still get a profile page that
  // shows their bio and links them to /explore — useful for sharing.
  if (!profile && !gh) notFound();

  const displayName = gh?.name ?? profile?.ghUsername ?? username;
  const avatar =
    gh?.avatarUrl ?? profile?.avatarUrl ?? `https://github.com/${username}.png`;
  const linkedWalletCount = session?.user?.id
    ? (await getMyLinkedWallets(session.user.id)).length
    : 0;
  const signedInUsername =
    (session?.user as { githubUsername?: string | null } | undefined)
      ?.githubUsername ?? null;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-start">
          <Image
            src={avatar}
            alt=""
            width={112}
            height={112}
            sizes="112px"
            className="size-28 shrink-0 rounded-2xl border border-border/60 object-cover shadow-card-elevated"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-display text-fg">{displayName}</h1>
              {gh ? (
                <Badge variant="success" size="sm" dot dotColor="success">
                  GitHub verified
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-body-md text-fg-secondary">
              <span className="text-mono-md text-fg-secondary">
                @{username}
              </span>
              <Link
                href={`https://github.com/${username}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-label-md text-fg-secondary transition-colors hover:text-fg"
              >
                <Github className="size-4" />
                View on GitHub
                <ExternalLink className="size-3" />
              </Link>
            </div>
            {gh?.bio ? (
              <p className="max-w-2xl text-body-md text-fg-secondary">
                {gh.bio}
              </p>
            ) : null}
            {gh ? <GitHubMetaRow gh={gh} /> : null}
          </div>
        </div>

        {/* KPI strip — bordered cells, not cards. Matches the QuickStat pattern. */}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiCell label="Lifetime SOL earned">
            <span className="text-mono-md text-fg">
              {formatSol(profile?.totalLifetimeLamports ?? 0n, 4)}
            </span>
          </KpiCell>
          <KpiCell label="Projects on GitShipt">
            <span className="text-mono-md text-fg">
              {(profile?.projectsCount ?? 0).toLocaleString("en-US")}
            </span>
          </KpiCell>
          <KpiCell label="Total PRs">
            <span className="text-mono-md text-fg">
              {formatScore(profile?.totalPRs ?? 0)}
            </span>
          </KpiCell>
          <KpiCell label="Total commits">
            <span className="text-mono-md text-fg">
              {formatScore(profile?.totalCommits ?? 0)}
            </span>
          </KpiCell>
        </dl>

        {gh ? <GitHubStatRow gh={gh} /> : null}
      </header>

      <ContributorClaimCta
        username={username}
        profile={profile}
        signedIn={Boolean(session?.user?.id)}
        signedInUsername={signedInUsername}
        hasLinkedWallet={linkedWalletCount > 0}
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectsContributedTo
          rows={profile?.byProject ?? []}
          username={username}
        />
        <EarningsHistory rows={profile?.recentPayouts ?? []} />
      </section>
    </div>
  );
}

function ContributorClaimCta({
  username,
  profile,
  signedIn,
  signedInUsername,
  hasLinkedWallet,
}: {
  username: string;
  profile: Awaited<ReturnType<typeof getContributorProfile>>;
  signedIn: boolean;
  signedInUsername: string | null;
  hasLinkedWallet: boolean;
}) {
  const hasGitShiptRows = (profile?.projectsCount ?? 0) > 0;
  const hasEarnings = (profile?.totalLifetimeLamports ?? 0n) > 0n;
  const isOwnProfile =
    signedInUsername?.toLowerCase() === username.toLowerCase();

  if (!signedIn) {
    return (
      <ClaimPanel
        icon={<Coins className="size-4" aria-hidden />}
        title={
          hasEarnings
            ? "Set up contributor claiming"
            : hasGitShiptRows
              ? "Link a wallet for future payouts"
              : "No GitShipt earnings recorded yet"
        }
        description={
          hasEarnings
            ? "Sign in with GitHub and use the earnings dashboard to review indexed payouts. Claimable fees are signed directly in Bags."
            : hasGitShiptRows
              ? "This profile is on GitShipt leaderboards. Sign in and link a wallet so future payouts have a direct destination."
              : "This GitHub account is public, but GitShipt has not indexed contributor earnings for it yet."
        }
        primaryHref={`/auth/signin?next=${encodeURIComponent("/auth/wallet")}`}
        primaryLabel="Sign in and link wallet"
        secondaryHref="/explore"
        secondaryLabel="Explore projects"
      />
    );
  }

  if (!isOwnProfile && signedInUsername) {
    return (
      <ClaimPanel
        icon={<Github className="size-4" aria-hidden />}
        title={`Viewing @${username}`}
        description={`You are signed in as @${signedInUsername}. To claim this profile, use the GitHub account that owns @${username}.`}
        primaryHref="/dashboard/earnings"
        primaryLabel="Open my earnings"
        secondaryHref="/explore"
        secondaryLabel="Explore projects"
      />
    );
  }

  if (!hasLinkedWallet) {
    return (
      <ClaimPanel
        icon={<Wallet className="size-4" aria-hidden />}
        title={
          hasEarnings
            ? "Link a wallet to claim earnings"
            : "Link a wallet for future payouts"
        }
        description={
          hasEarnings
            ? "Your GitHub identity is signed in. Open Bags with this account to connect a wallet and claim fee-share earnings."
            : "No claimable earnings are visible on this public profile yet. Linking a wallet prepares your account for future GitShipt payouts."
        }
        primaryHref="/auth/wallet"
        primaryLabel="Link wallet"
        secondaryHref="/dashboard/earnings"
        secondaryLabel="View earnings"
      />
    );
  }

  return (
    <ClaimPanel
      icon={<Coins className="size-4" aria-hidden />}
      title={hasEarnings ? "Manage earnings in dashboard" : "Wallet linked"}
      description={
        hasEarnings
          ? "Your wallet is linked. Open the earnings dashboard to review lifetime payouts and continue to Bags when fees are claimable."
          : "No claimable earnings are visible yet. Your linked wallet is ready for future contributor payouts."
      }
      primaryHref="/dashboard/earnings"
      primaryLabel={hasEarnings ? "Open earnings" : "Check earnings"}
      secondaryHref={hasEarnings ? "/dashboard/wallets" : "/explore"}
      secondaryLabel={hasEarnings ? "Manage wallets" : "Explore projects"}
    />
  );
}

function ClaimPanel({
  icon,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <section
      aria-labelledby="claim-path-title"
      className="rounded-xl border border-border bg-surface-elevated/60 p-4 shadow-card-elevated sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border-strong bg-surface text-primary-readable">
            {icon}
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="claim-path-title" className="text-headline-sm text-fg">
              {title}
            </h2>
            <p className="max-w-3xl text-body-sm text-fg-secondary">
              {description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button asChild variant="primary">
            <Link href={primaryHref}>
              {primaryLabel}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function GitHubMetaRow({ gh }: { gh: GitHubUserProfile }) {
  const items: Array<{ icon: React.ReactNode; label: React.ReactNode }> = [];

  if (gh.company)
    items.push({
      icon: <Building2 className="size-3.5" aria-hidden />,
      label: gh.company,
    });
  if (gh.location)
    items.push({
      icon: <MapPin className="size-3.5" aria-hidden />,
      label: gh.location,
    });
  if (gh.blog) {
    const href = gh.blog.startsWith("http") ? gh.blog : `https://${gh.blog}`;
    items.push({
      icon: <Globe className="size-3.5" aria-hidden />,
      label: (
        <Link
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="transition-colors hover:text-fg"
        >
          {gh.blog.replace(/^https?:\/\//, "")}
        </Link>
      ),
    });
  }
  if (gh.twitterUsername)
    items.push({
      icon: <Twitter className="size-3.5" aria-hidden />,
      label: (
        <Link
          href={`https://x.com/${gh.twitterUsername}`}
          target="_blank"
          rel="noreferrer noopener"
          className="transition-colors hover:text-fg"
        >
          @{gh.twitterUsername}
        </Link>
      ),
    });

  const joined = new Date(gh.createdAt);
  items.push({
    icon: <Calendar className="size-3.5" aria-hidden />,
    label: `Joined ${joined.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    })}`,
  });

  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-fg-muted">
      {items.map((it, i) => (
        <li key={i} className="inline-flex items-center gap-1.5">
          {it.icon}
          <span className="text-fg-secondary">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

function GitHubStatRow({ gh }: { gh: GitHubUserProfile }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      <KpiCell
        label="Public repos"
        icon={<GitFork className="size-3" aria-hidden />}
      >
        <span className="text-mono-md text-fg">
          {gh.publicRepos.toLocaleString("en-US")}
        </span>
      </KpiCell>
      <KpiCell
        label="Followers"
        icon={<Users className="size-3" aria-hidden />}
      >
        <span className="text-mono-md text-fg">
          {gh.followers.toLocaleString("en-US")}
        </span>
      </KpiCell>
      <KpiCell label="Following">
        <span className="text-mono-md text-fg">
          {gh.following.toLocaleString("en-US")}
        </span>
      </KpiCell>
    </dl>
  );
}

function KpiCell({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 px-4 py-3">
      <dt className="inline-flex items-center gap-1 text-label-sm text-fg-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
