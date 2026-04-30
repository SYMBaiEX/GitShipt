import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { desc, isNotNull } from "drizzle-orm";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GitCompare,
  Layers,
  Sparkles,
} from "lucide-react";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { Card, CardHeader, CardTitle, CardDescription } from "@repo/ui";
import { Badge } from "@repo/ui";
import { StatTile } from "@/components/shared/StatTile";
import { dbHttp } from "@/db";
import { fundReconciliationRuns, projects } from "@/db/schema";
import { bags } from "@/lib/bags/client";
import { cacheLife, cacheTag } from "next/cache";
import { formatRelativeTime } from "@repo/lib";


type DbProjectStatus =
  | "draft"
  | "launch_configured"
  | "live"
  | "paused"
  | "killed"
  | "simulated_live"
  | "tracked";

type BagsStatus = "PRE_LAUNCH" | "PRE_GRAD" | "MIGRATING" | "MIGRATED";

interface BagsFeedItem {
  name: string;
  symbol: string;
  tokenMint: string;
  status: BagsStatus;
  image?: string | null;
}

interface DbProjectRow {
  id: string;
  ghOwner: string;
  ghRepo: string;
  name: string;
  status: DbProjectStatus;
  tokenMint: string;
}

interface MismatchedRow {
  project: DbProjectRow;
  bags: BagsFeedItem;
}

/**
 * Bags ↔ DB reconciliation surface.
 *
 * Read-only dashboard joining `GET /token-launch/feed` (Bags's view) against
 * the local `projects` table (our view). Surfaces drift the operator should
 * investigate; writes nothing.
 *
 * Status mapping heuristic (refine as we learn):
 *   - DB `live` and `simulated_live` are treated as ≥ Bags `PRE_GRAD`. If
 *     Bags reports `PRE_LAUNCH` for one of these we flag a mismatch.
 *   - DB `paused` / `killed` are flagged as drift whenever Bags shows the
 *     token in *any* active bucket (`PRE_LAUNCH | PRE_GRAD | MIGRATING |
 *     MIGRATED`) — operator paused us, but the on-Bags side is still alive.
 *   - DB `draft` / `launch_configured` are expected to map to Bags
 *     `PRE_LAUNCH`; anything later is drift (token migrated without DB
 *     catching up).
 *   - Everything else falls through as "in sync".
 *
 * This is a heuristic, not a spec. Future-you: refine when the migration
 * pipeline lands a richer status state machine.
 */
export default function AdminReconciliationPage() {
  return (
    <Suspense fallback={null}>
      <AdminReconciliationPageContent />
    </Suspense>
  );
}

async function AdminReconciliationPageContent() {
  await requireAdminPage("admin.access", "/admin");

  const [feed, dbRows] = await Promise.all([
    getReconciliationFeedCached(),
    dbHttp
      .select({
        id: projects.id,
        ghOwner: projects.ghOwner,
        ghRepo: projects.ghRepo,
        name: projects.name,
        status: projects.status,
        tokenMint: projects.tokenMint,
      })
      .from(projects)
      .where(isNotNull(projects.tokenMint)),
  ]);
  const [latestFundRun] = await dbHttp
    .select({
      status: fundReconciliationRuns.status,
      hotWalletBalanceLamports:
        fundReconciliationRuns.hotWalletBalanceLamports,
      escrowLiabilityLamports: fundReconciliationRuns.escrowLiabilityLamports,
      unsettledRecipientLamports:
        fundReconciliationRuns.unsettledRecipientLamports,
      manualReviewCount: fundReconciliationRuns.manualReviewCount,
      finalizedSignatureCount:
        fundReconciliationRuns.finalizedSignatureCount,
      staleSignatureCount: fundReconciliationRuns.staleSignatureCount,
      checkedAt: fundReconciliationRuns.checkedAt,
    })
    .from(fundReconciliationRuns)
    .orderBy(desc(fundReconciliationRuns.checkedAt))
    .limit(1);

  const dbByMint = new Map<string, DbProjectRow>();
  for (const r of dbRows) {
    if (r.tokenMint == null) continue;
    dbByMint.set(r.tokenMint, {
      id: r.id,
      ghOwner: r.ghOwner,
      ghRepo: r.ghRepo,
      name: r.name,
      status: r.status,
      tokenMint: r.tokenMint,
    });
  }

  const bagsByMint = new Map<string, BagsFeedItem>();
  for (const item of feed) bagsByMint.set(item.tokenMint, item);

  const bagsOnly: BagsFeedItem[] = [];
  for (const [mint, item] of bagsByMint) {
    if (!dbByMint.has(mint)) bagsOnly.push(item);
  }

  const dbOnly: DbProjectRow[] = [];
  const mismatched: MismatchedRow[] = [];
  let inSyncCount = 0;
  for (const [mint, project] of dbByMint) {
    const bagsItem = bagsByMint.get(mint);
    if (!bagsItem) {
      dbOnly.push(project);
      continue;
    }
    if (isMismatch(project.status, bagsItem.status)) {
      mismatched.push({ project, bags: bagsItem });
    } else {
      inSyncCount += 1;
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-md">
            Bags ↔ DB reconciliation
          </h1>
          <p className="text-body-sm text-fg-secondary">
            Drift snapshot · {formatRelativeTime(new Date())}
          </p>
        </div>
        <Badge
          variant={
            mismatched.length === 0 && bagsOnly.length === 0 ? "success" : "warning"
          }
          size="sm"
          dot={mismatched.length === 0 && bagsOnly.length === 0}
        >
          {mismatched.length === 0 && bagsOnly.length === 0
            ? "No drift"
            : "Drift detected"}
        </Badge>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="In sync"
          value={inSyncCount.toString()}
          icon={CheckCircle2}
          accent={inSyncCount > 0 ? "success" : "neutral"}
        />
        <StatTile
          label="Mismatched"
          value={mismatched.length.toString()}
          icon={AlertTriangle}
          accent={mismatched.length > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="DB only"
          value={dbOnly.length.toString()}
          icon={Database}
          accent={dbOnly.length > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Bags only"
          value={bagsOnly.length.toString()}
          icon={Sparkles}
          accent={bagsOnly.length > 0 ? "warning" : "neutral"}
        />
      </section>

      {latestFundRun ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Fund status"
            value={latestFundRun.status}
            icon={GitCompare}
            accent={
              latestFundRun.status === "critical"
                ? "danger"
                : latestFundRun.status === "warning"
                  ? "warning"
                  : "success"
            }
          />
          <StatTile
            label="Recorded liabilities"
            value={formatSol(
              latestFundRun.escrowLiabilityLamports +
                latestFundRun.unsettledRecipientLamports,
            )}
            icon={Database}
            accent="neutral"
          />
          <StatTile
            label="Manual review"
            value={latestFundRun.manualReviewCount.toString()}
            icon={AlertTriangle}
            accent={latestFundRun.manualReviewCount > 0 ? "danger" : "neutral"}
          />
          <StatTile
            label="Last check"
            value={formatRelativeTime(latestFundRun.checkedAt)}
            icon={CheckCircle2}
            accent={latestFundRun.staleSignatureCount > 0 ? "warning" : "neutral"}
          />
        </section>
      ) : null}

      <MismatchedCard rows={mismatched} />
      <DbOnlyCard rows={dbOnly} />
      <BagsOnlyCard rows={bagsOnly} />
    </div>
  );
}

/**
 * Heuristic mapping; see top-of-file comment for rationale.
 * Returns true when the two sides disagree enough to warrant operator review.
 */
async function getReconciliationFeedCached(): Promise<BagsFeedItem[]> {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 1800 });
  cacheTag("gitshipt:admin:reconciliation");
  const items = await bags.getLaunchFeed();
  return items.map((it) => ({
    name: it.name,
    symbol: it.symbol,
    tokenMint: it.tokenMint,
    status: it.status,
    image: it.image ?? null,
  }));
}

function isMismatch(db: DbProjectStatus, bags: BagsStatus): boolean {
  switch (db) {
    case "live":
    case "simulated_live":
      // We claim it's live on our side; Bags should be at least PRE_GRAD.
      return bags === "PRE_LAUNCH";
    case "paused":
    case "killed":
      // We've taken it offline; any active bucket on Bags is drift.
      return (
        bags === "PRE_LAUNCH" ||
        bags === "PRE_GRAD" ||
        bags === "MIGRATING" ||
        bags === "MIGRATED"
      );
    case "draft":
    case "launch_configured":
      // We haven't promoted it; Bags should still be PRE_LAUNCH.
      return bags !== "PRE_LAUNCH";
    default:
      return false;
  }
}

function shortMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 6)}...${mint.slice(-4)}`;
}

function formatSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fractional = (lamports % 1_000_000_000n).toString().padStart(9, "0");
  return `${whole}.${fractional.slice(0, 3)} SOL`;
}

function DbStatusBadge({ status }: { status: DbProjectStatus }) {
  switch (status) {
    case "live":
      return (
        <Badge variant="success" size="sm" dot>
          live
        </Badge>
      );
    case "simulated_live":
      return (
        <Badge variant="info" size="sm">
          Not Live
        </Badge>
      );
    case "paused":
      return (
        <Badge variant="warning" size="sm">
          paused
        </Badge>
      );
    case "killed":
      return (
        <Badge variant="danger" size="sm">
          killed
        </Badge>
      );
    case "launch_configured":
      return (
        <Badge variant="default" size="sm">
          launch_configured
        </Badge>
      );
    default:
      return (
        <Badge variant="default" size="sm">
          draft
        </Badge>
      );
  }
}

function BagsStatusBadge({ status }: { status: BagsStatus }) {
  switch (status) {
    case "MIGRATED":
      return (
        <Badge variant="success" size="sm" dot>
          MIGRATED
        </Badge>
      );
    case "MIGRATING":
      return (
        <Badge variant="warning" size="sm">
          MIGRATING
        </Badge>
      );
    case "PRE_GRAD":
      return (
        <Badge variant="info" size="sm">
          PRE_GRAD
        </Badge>
      );
    default:
      return (
        <Badge variant="default" size="sm">
          PRE_LAUNCH
        </Badge>
      );
  }
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-4 text-body-sm text-fg-muted">
      <CheckCircle2 className="size-4 text-fg-muted" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

function MismatchedCard({ rows }: { rows: MismatchedRow[] }) {
  return (
    <Card depth="flat" padding="none" className="overflow-hidden">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="size-4 text-fg-muted" /> Mismatched ({rows.length})
        </CardTitle>
        <CardDescription>
          Both sides know the token, but DB status doesn&apos;t map to the Bags
          state. Worth investigating before next snapshot.
        </CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyRow message="No drift detected" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-elevated/50 text-label-sm text-fg-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Slug</th>
                <th className="px-4 py-2 font-medium">Our status</th>
                <th className="px-4 py-2 font-medium">Bags status</th>
                <th className="px-4 py-2 font-medium">Token mint</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const slug = `${r.project.ghOwner}/${r.project.ghRepo}`;
                return (
                  <tr
                    key={r.project.id}
                    className="border-t border-border/40 hover:bg-surface-elevated/40"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/projects/${r.project.id}`}
                        className="flex min-w-0 items-center gap-2"
                      >
                        {r.bags.image ? (
                          <Image
                            src={r.bags.image}
                            alt=""
                            width={24}
                            height={24}
                            sizes="24px"
                            className="size-6 shrink-0 rounded-md"
                          />
                        ) : (
                          <span className="size-6 shrink-0 rounded-md bg-surface-elevated" />
                        )}
                        <span className="truncate text-fg">
                          {r.project.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-mono-sm text-fg-secondary">
                      {slug}
                    </td>
                    <td className="px-4 py-2">
                      <DbStatusBadge status={r.project.status} />
                    </td>
                    <td className="px-4 py-2">
                      <BagsStatusBadge status={r.bags.status} />
                    </td>
                    <td className="px-4 py-2 text-mono-sm text-fg-muted">
                      {shortMint(r.project.tokenMint)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DbOnlyCard({ rows }: { rows: DbProjectRow[] }) {
  return (
    <Card depth="flat" padding="none" className="overflow-hidden">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-fg-muted" /> DB only ({rows.length})
        </CardTitle>
        <CardDescription>
          Projects with a tokenMint that doesn&apos;t appear in the Bags feed.
          Could be still pre-launch or feed pagination drift.
        </CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyRow message="No drift detected" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-elevated/50 text-label-sm text-fg-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Slug</th>
                <th className="px-4 py-2 font-medium">Our status</th>
                <th className="px-4 py-2 font-medium">Token mint</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const slug = `${p.ghOwner}/${p.ghRepo}`;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-border/40 hover:bg-surface-elevated/40"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="text-fg underline-offset-2 hover:underline"
                      >
                        {slug}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <DbStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2 text-mono-sm text-fg-muted">
                      {shortMint(p.tokenMint)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function BagsOnlyCard({ rows }: { rows: BagsFeedItem[] }) {
  return (
    <Card depth="flat" padding="none" className="overflow-hidden">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4 text-fg-muted" /> Bags only ({rows.length})
        </CardTitle>
        <CardDescription>
          Tokens in Bags&apos;s feed with no matching project. Should be empty
          in steady state — investigate any non-zero count.
        </CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyRow message="No drift detected" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-elevated/50 text-label-sm text-fg-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Symbol</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Bags status</th>
                <th className="px-4 py-2 font-medium">Token mint</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr
                  key={it.tokenMint}
                  className="border-t border-border/40 hover:bg-surface-elevated/40"
                >
                  <td className="px-4 py-2 text-mono-sm text-fg">
                    {it.symbol}
                  </td>
                  <td className="px-4 py-2 text-fg-secondary">{it.name}</td>
                  <td className="px-4 py-2">
                    <BagsStatusBadge status={it.status} />
                  </td>
                  <td className="px-4 py-2 text-mono-sm text-fg-muted">
                    {shortMint(it.tokenMint)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
