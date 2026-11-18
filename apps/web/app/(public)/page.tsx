import { Github } from "@repo/ui";
import { Suspense } from "react";
import Image, { type ImageProps, type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { Card } from "@repo/ui";
import { cn, formatSol } from "@repo/lib";
import {
  getLandingData,
  getPlatformIndexerHeartbeat,
  type LandingLaunchToken,
} from "@/lib/queries/global";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import {
  getProjectBySlug,
  getProjectLeaderboard,
  type LeaderboardRow,
  type ProjectHeader,
} from "@/lib/queries/project-page";
import {
  BentoTickerCell,
  getLandingTickerCellKeys,
} from "../_components/BentoTicker";
import flagDark from "../../public/flag-dark.png";
import flagLight from "../../public/flag-light.png";
import miaDark from "../../public/mia-dark.png";
import miaLight from "../../public/mia-light.png";
import shipDark from "../../public/ship-dark.png";
import shipLight from "../../public/ship-light.png";
const FEATURED_OWNER = "SYMBaiEX";
const FEATURED_REPO = "gitshipt";

type ThemeAwareImageProps = Omit<ImageProps, "src" | "loading" | "preload"> & {
  srcDark: StaticImageData;
  srcLight: StaticImageData;
};

function ThemeAwareImage({
  srcDark,
  srcLight,
  className,
  alt,
  ...props
}: ThemeAwareImageProps) {
  return (
    <>
      <Image
        {...props}
        src={srcLight}
        alt={alt}
        className={cn("gitshipt-theme-image-light", className)}
      />
      <Image
        {...props}
        src={srcDark}
        alt={alt}
        className={cn("gitshipt-theme-image-dark", className)}
      />
    </>
  );
}

/**
 * Landing page — two-column on wide screens, single reading order on mobile.
 *
 *   Row 1 (flex-1): Hero (cols 1-8) | Featured project: GitShipt (cols 9-12)
 *   Row 2 (auto):   4 live KPI cells, full width
 *
 * The featured project is the GitShipt repo itself — debuts the project on
 * its own landing and shows the contributors who actually built it.
 */

export default function LandingPage() {
  return (
    <div className="gitshipt-landing-page flex min-w-0 flex-col gap-5 lg:gap-6 lg:py-7">
      <div className="mx-auto grid w-full max-w-[1340px] grid-cols-[minmax(0,1fr)] items-center gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:gap-x-8">
        <section className="flex min-w-0 flex-col items-start gap-4 xl:col-start-1 xl:row-start-1 xl:self-end">
          <h1 className="text-display text-fg">
            Your repo, <span className="text-fg-muted">tokenized.</span>
          </h1>

          <p className="max-w-xl text-body-md text-fg-secondary">
            Launch a Bags.fm token for an eligible personal GitHub repository.
            The linked owner wallet receives creator rewards through Bags.
            Contribution rankings are informational.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
            <Link
              href="https://github.com/SYMBaiEX/gitshipt"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-fg-muted transition-colors hover:text-fg"
            >
              <Github className="size-3.5" aria-hidden />
              SYMBaiEX/gitshipt
              <ArrowUpRight className="size-3" />
            </Link>
            <Suspense fallback={null}>
              <LandingIndexer />
            </Suspense>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild variant="primary" size="lg">
              <Link href="/launch">
                Launch a token
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/explore">Browse projects</Link>
            </Button>
          </div>
        </section>

        <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <HeroArtwork />
        </div>
        <div className="min-w-0 xl:col-start-1 xl:row-start-2 xl:self-start">
          <Suspense fallback={null}>
            <LandingFeaturedProject />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <LandingActivity />
      </Suspense>
    </div>
  );
}

async function LandingIndexer() {
  return (
    <LiveIndicator
      lastSyncAt={await getPlatformIndexerHeartbeat()}
      label="Indexer"
    />
  );
}

async function LandingFeaturedProject() {
  const header = await getProjectBySlug(FEATURED_OWNER, FEATURED_REPO);
  const contributors = header
    ? await getProjectLeaderboard(header.id, header.payoutConfig)
    : [];
  return <FeaturedProjectCard header={header} contributors={contributors} />;
}

async function LandingActivity() {
  const { ticker, latestLaunches } = await getLandingData();
  const tickerCellKeys = getLandingTickerCellKeys(ticker);

  return (
    <div className="relative mx-auto mt-auto flex w-full flex-col gap-4 lg:max-w-[1088px] lg:shrink-0 2xl:max-w-[1340px]">
      <TokenLaunchCarousel launches={latestLaunches} />
      <section
        aria-label="Live platform metrics"
        className={
          tickerCellKeys.length === 4
            ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3"
            : "grid grid-cols-1 gap-2 sm:grid-cols-3 lg:gap-3"
        }
      >
        {tickerCellKeys.map((cellKey) => (
          <BentoTickerCell key={cellKey} initial={ticker} cellKey={cellKey} />
        ))}
      </section>
    </div>
  );
}

function TokenLaunchCarousel({ launches }: { launches: LandingLaunchToken[] }) {
  if (launches.length === 0) return null;

  return (
    <section
      aria-label="Newest token launches"
      className="mx-auto w-full max-w-[1340px] overflow-x-auto"
    >
      <div className="flex w-max gap-2 py-1">
        {launches.map((launch, index) => (
          <TokenLaunchCard
            key={launch.id}
            launch={launch}
            priorityImage={index < 5}
          />
        ))}
      </div>
    </section>
  );
}

function HeroArtwork() {
  return (
    <div className="gitshipt-mia-stage pointer-events-none relative order-2 mx-auto aspect-square w-full max-w-[420px] overflow-visible sm:max-w-[540px] lg:order-none lg:h-[min(68vh,660px)] lg:w-full lg:max-w-none lg:shrink-0 2xl:h-[min(70vh,720px)] 2xl:w-full">
      <ThemeAwareImage
        srcDark={miaDark}
        srcLight={miaLight}
        alt=""
        fill
        fetchPriority="high"
        sizes="(max-width: 640px) 420px, (max-width: 1024px) 540px, (max-width: 1536px) 700px, min(64vw, 860px)"
        className="gitshipt-mia-art z-[1] object-contain object-bottom p-[clamp(6px,2vw,24px)]"
      />
      <HeroFlag />
      <HeroShip />
    </div>
  );
}

function HeroFlag() {
  return (
    <div
      aria-hidden="true"
      className="gitshipt-flag-wave absolute right-[5%] top-[4%] z-[3] w-[clamp(86px,23vw,126px)] sm:right-[7%] sm:top-[5%] sm:w-[clamp(118px,18vw,156px)] lg:right-[12%] lg:top-[9%] lg:w-[clamp(128px,10vw,164px)]"
    >
      <ThemeAwareImage
        srcDark={flagDark}
        srcLight={flagLight}
        alt=""
        width={480}
        height={640}
        fetchPriority="high"
        sizes="(max-width: 640px) 126px, (max-width: 1024px) 156px, 164px"
        className="gitshipt-flag-art h-auto w-full select-none object-contain"
      />
    </div>
  );
}

function HeroShip() {
  return (
    <div
      aria-hidden="true"
      className="gitshipt-ship-float pointer-events-none absolute bottom-[7%] left-[5%] z-[2] w-[clamp(88px,24vw,132px)] sm:bottom-[8%] sm:left-[7%] sm:w-[clamp(124px,19vw,164px)] lg:bottom-[13%] lg:left-[4%] lg:w-[clamp(132px,10vw,172px)]"
    >
      <ThemeAwareImage
        srcDark={shipDark}
        srcLight={shipLight}
        alt=""
        width={440}
        height={440}
        sizes="(max-width: 640px) 132px, (max-width: 1024px) 164px, 172px"
        className="gitshipt-ship-art h-auto w-full select-none object-contain"
      />
    </div>
  );
}

function TokenLaunchCard({
  launch,
  priorityImage,
}: {
  launch: LandingLaunchToken;
  priorityImage: boolean;
}) {
  const avatar = launch.imageUrl ?? `https://github.com/${launch.ghOwner}.png`;
  const symbol = launch.symbol ? `$${launch.symbol}` : "TOKEN";

  return (
    <Link
      href={`/r/${launch.slug}`}
      className="group flex min-w-[164px] items-center gap-2 rounded-lg border border-border/60 bg-surface/40 px-2.5 py-2 transition-colors hover:border-border-strong hover:bg-surface-elevated/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-w-[184px] lg:min-w-[196px] 2xl:min-w-[208px]"
    >
      <span className="relative size-8 shrink-0 overflow-hidden rounded-md bg-surface-elevated">
        <Image
          src={avatar}
          alt=""
          fill
          loading={priorityImage ? "eager" : "lazy"}
          fetchPriority={priorityImage ? "high" : "low"}
          sizes="32px"
          className="object-cover"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-label-sm text-fg">{launch.name}</span>
          <span className="shrink-0 rounded-sm border border-border/70 px-1.5 py-0.5 text-mono-sm text-primary-readable">
            {symbol}
          </span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-caption text-fg-muted">
            {launch.slug}
          </span>
          <span className="shrink-0 text-mono-sm text-fg-secondary">
            {formatSol(launch.lifetimeFeesLamports, 2)}
          </span>
        </span>
      </span>
    </Link>
  );
}

/**
 * Featured-project bento card — debuts the GitShipt repo on its own landing.
 * Top: project header (avatar, name, slug, status, stat row).
 * Bottom: scrollable list of top contributors with rank medal, avatar,
 * username, and score. Whole card links into the project page.
 */
function FeaturedProjectCard({
  header,
  contributors,
}: {
  header: ProjectHeader | null;
  contributors: LeaderboardRow[];
}) {
  if (!header) {
    return (
      <Card
        depth="raised"
        padding="lg"
        className="flex h-full items-center justify-center text-center"
      >
        <p className="text-body-sm text-fg-secondary">
          The GitShipt debut token hasn’t launched yet.
        </p>
      </Card>
    );
  }

  const avatar = header.imageUrl ?? `https://github.com/${header.ghOwner}.png`;
  const top = contributors.slice(0, 25);
  const projectHref = `/r/${header.slug}`;
  const statusLabel = header.status === "simulated_live" ? "Not Live" : "Live";

  return (
    <Card
      depth="raised"
      padding="none"
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
        <div className="inline-flex items-center gap-2">
          <Trophy className="size-4 text-fg-secondary" aria-hidden />
          <h2 className="text-label-sm uppercase text-fg-muted">
            Featured project
          </h2>
        </div>
        <Link
          href={projectHref}
          className="inline-flex items-center gap-1 text-label-sm text-fg-secondary transition-colors hover:text-fg"
        >
          Open
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <Link
        href={projectHref}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated/40"
      >
        <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-surface-elevated">
          <Image
            src={avatar}
            alt=""
            fill
            loading="eager"
            sizes="40px"
            className="object-cover"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-headline-sm text-fg">{header.name}</h3>
            <Badge variant="success" size="sm" dot>
              {statusLabel}
            </Badge>
          </div>
          <p className="truncate text-caption text-fg-muted">{header.slug}</p>
        </div>
      </Link>

      <div className="grid grid-cols-3 gap-2 border-y border-border/60 bg-bg/30 px-4 py-2.5">
        <Stat
          label="Devs"
          value={header.contributorsCount.toLocaleString("en-US")}
        />
        <Stat label="Stars" value={header.stars.toLocaleString("en-US")} />
        <Stat label="Forks" value={header.forks.toLocaleString("en-US")} />
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
        <span className="text-label-sm uppercase text-fg-muted">
          Top contributors
        </span>
        <Link
          href={projectHref}
          className="text-label-sm text-fg-secondary transition-colors hover:text-fg"
        >
          Leaderboard →
        </Link>
      </div>

      {top.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6 text-center text-body-sm text-fg-muted">
          No contributors indexed yet.
        </div>
      ) : (
        <ul className="flex flex-1 flex-col divide-y divide-border/60 overflow-y-auto">
          {top.map((c) => (
            <li key={c.contributorId}>
              <Link
                href={`/u/${c.ghUsername}`}
                className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-elevated/40"
              >
                <RankMedal rank={c.rank} />
                <span className="inline-flex min-w-0 items-center gap-2">
                  {c.avatarUrl ? (
                    <span className="relative size-5 shrink-0 overflow-hidden rounded-sm bg-surface-elevated">
                      <Image
                        src={c.avatarUrl}
                        alt=""
                        fill
                        sizes="20px"
                        className="object-cover"
                      />
                    </span>
                  ) : null}
                  <span className="truncate text-label-md text-fg">
                    {c.ghUsername}
                  </span>
                </span>
                <span className="text-mono-sm text-fg-secondary tabular-nums">
                  {Math.round(c.weightPercent)}% share
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-fg-muted">{label}</span>
      <span className="text-mono-sm text-fg">{value}</span>
    </div>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="grid size-5 place-items-center rounded-sm bg-rank-gold text-bg text-mono-sm font-medium">
        {rank}
      </span>
    );
  if (rank === 2)
    return (
      <span className="grid size-5 place-items-center rounded-sm bg-rank-silver text-bg text-mono-sm font-medium">
        {rank}
      </span>
    );
  if (rank === 3)
    return (
      <span className="grid size-5 place-items-center rounded-sm bg-rank-bronze text-bg text-mono-sm font-medium">
        {rank}
      </span>
    );
  return (
    <span className="grid size-5 place-items-center text-mono-sm text-fg-muted">
      {rank}
    </span>
  );
}
