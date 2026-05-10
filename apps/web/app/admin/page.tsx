import { Suspense } from "react";
import {
  Activity,
  AlertCircle,
  Coins,
  Layers,
  Sparkles,
  Vault,
  Wallet,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { Card, CardHeader, CardTitle, CardDescription } from "@repo/ui";
import { Badge } from "@repo/ui";
import { Pill } from "@repo/ui";
import { StatTile } from "@/components/shared/StatTile";
import {
  getOpsKpis,
  getHeartbeats,
  getRecentFailedPayouts,
  getAuditLogs,
} from "@/lib/queries/admin";
import { solanaConnection, hasSolanaConnection } from "@/lib/solana/connection";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import { hasCredentials } from "@/lib/env";
import { cacheLife, cacheTag } from "next/cache";
import { bags } from "@/lib/bags/client";
import { formatRelativeTime, formatSol } from "@repo/lib";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { cn } from "@repo/lib";

/**
 * Ops dashboard. Top stat row + 2x2 bento (heartbeats / failed payouts /
 * recent audit / integrations health).
 */
export default function AdminOpsPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsPageContent />
    </Suspense>
  );
}

async function AdminOpsPageContent() {
  // Layout already gates `admin.access`, but we re-check inside every page
  // so a layout regression cannot silently expose the route.
  await requireAdminPage("admin.access", "/admin");

  // Hot-wallet balance (fire-and-forget; null on failure).
  const [hotPubkey, hotLamports] = await Promise.all([
    Promise.resolve(payoutSignerPublicKey()),
    fetchHotWalletLamports(),
  ]);

  // eslint-disable-next-line react-hooks/purity -- Server Component needs a rolling ops window.
  const recentAuditSinceMs = Date.now() - 60 * 60 * 1000;
  const [kpis, heartbeats, failed, recentAudit, healthSummary] =
    await Promise.all([
      getOpsKpis(hotLamports),
      getHeartbeats(),
      getRecentFailedPayouts(10),
      getAuditLogs({ sinceMs: recentAuditSinceMs, limit: 20 }),
      fetchHealthSummary(),
    ]);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-md">Ops dashboard</h1>
          <p className="text-body-sm text-fg-secondary">
            Live system snapshot · {formatRelativeTime(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" dot>
            Live
          </Badge>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Active projects"
          value={kpis.activeProjects.toString()}
          icon={Layers}
          accent="primary"
        />
        <StatTile
          label="Frozen awaiting payout"
          value={kpis.frozenAwaitingPayout.toString()}
          icon={Sparkles}
        />
        <StatTile
          label="Failed payouts"
          value={kpis.failedPayouts.toString()}
          icon={AlertCircle}
          accent={kpis.failedPayouts > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Hot wallet"
          value={
            kpis.hotWalletSol == null ? (
              <span className="text-fg-muted">—</span>
            ) : (
              `${kpis.hotWalletSol.toFixed(4)} SOL`
            )
          }
          sub={hotPubkey ?? "no signer configured"}
          icon={Wallet}
        />
        <StatTile
          label="GitShipt custody"
          value="0.0000 SOL"
          icon={Vault}
          sub="Contributor claims stay in Bags"
        />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <HeartbeatsCard rows={heartbeats} />
        <FailedPayoutsCard rows={failed} />
        <RecentAuditCard rows={recentAudit} />
        <HealthCard summary={healthSummary} />
      </section>
    </div>
  );
}

async function fetchHotWalletLamports(): Promise<number | null> {
  if (!hasSolanaConnection() || !hasCredentials.payoutKey()) return null;
  const pk = payoutSignerPublicKey();
  if (!pk) return null;
  return await readHotWalletBalance(pk);
}

async function readHotWalletBalance(pk: string): Promise<number | null> {
  "use cache";
  cacheLife({ revalidate: 30, stale: 15, expire: 300 });
  cacheTag("gitshipt:admin:hot-wallet");
  try {
    const { PublicKey } = await import("@solana/web3.js");
    const conn = solanaConnection("confirmed");
    return await conn.getBalance(new PublicKey(pk));
  } catch {
    return null;
  }
}

interface HealthSummary {
  bags: { ok: boolean; latencyMs: number | null };
  github: { ok: boolean; latencyMs: number | null };
}

async function fetchHealthSummary(): Promise<HealthSummary> {
  const [bagsRes, ghRes] = await Promise.all([pingBags(), pingGitHub()]);
  return { bags: bagsRes, github: ghRes };
}

async function pingBags(): Promise<{ ok: boolean; latencyMs: number | null }> {
  // Validates Bags REST API key via GET /auth/me. No Solana RPC, unlike the
  // legacy bags.getLifetimeFees(SOL_MINT) probe which derived an on-chain
  // PDA and burned Helius credits. Cached 60s so /admin renders are cheap.
  if (!hasCredentials.bags()) return { ok: false, latencyMs: null };
  return await pingBagsCached();
}

async function pingBagsCached(): Promise<{
  ok: boolean;
  latencyMs: number | null;
}> {
  "use cache";
  cacheLife({ revalidate: 60, stale: 30, expire: 600 });
  cacheTag("gitshipt:admin:health");
  const start = Date.now();
  try {
    await bags.authMe();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

async function pingGitHub(): Promise<{
  ok: boolean;
  latencyMs: number | null;
}> {
  "use cache";
  cacheLife({ revalidate: 30, stale: 15, expire: 300 });
  cacheTag("gitshipt:admin:health");
  const start = Date.now();
  try {
    const res = await fetch("https://api.github.com/octocat", {
      method: "HEAD",
    });
    return {
      ok: res.ok || res.status === 404,
      latencyMs: Date.now() - start,
    };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

function HeartbeatsCard({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getHeartbeats>>;
}) {
  return (
    <Card depth="raised" padding="sm">
      <CardHeader className="px-1.5 pt-1">
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-fg-muted" /> Workflow heartbeats
        </CardTitle>
        <CardDescription>
          Updated by `healthPulse` and per-workflow step writers.
        </CardDescription>
      </CardHeader>
      <ul className="mt-2 divide-y divide-border/40">
        {rows.length === 0 ? (
          <li className="px-1.5 py-3 text-body-sm text-fg-muted">
            No heartbeats recorded yet.
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-2 px-1.5 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    r.status === "green"
                      ? "bg-success"
                      : r.status === "yellow"
                        ? "bg-warning"
                        : "bg-danger",
                  )}
                  aria-hidden
                />
                <span className="truncate text-label-md text-fg">
                  {r.workflow}
                </span>
              </div>
              <span className="text-mono-sm text-fg-muted">
                {r.lastBeatAt ? <RelativeTime date={r.lastBeatAt} /> : "never"}
              </span>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function FailedPayoutsCard({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getRecentFailedPayouts>>;
}) {
  return (
    <Card depth="raised" padding="sm">
      <CardHeader className="px-1.5 pt-1">
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="size-4 text-fg-muted" /> Recent failed payouts
        </CardTitle>
        <CardDescription>
          Last 10 by scheduled time. Retry inline from{" "}
          <Link href="/admin/payouts" className="underline underline-offset-2">
            /admin/payouts
          </Link>
          .
        </CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="px-1.5 py-3 text-body-sm text-fg-muted">
          No failed payouts. Healthy.
        </p>
      ) : (
        <table className="mt-2 w-full text-left text-body-sm">
          <thead className="text-label-sm text-fg-muted">
            <tr className="border-b border-border/40">
              <th className="px-1.5 py-2 font-medium">Project</th>
              <th className="px-1.5 py-2 font-medium">Amount</th>
              <th className="px-1.5 py-2 font-medium">Attempts</th>
              <th className="px-1.5 py-2 font-medium">Last error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/30">
                <td className="px-1.5 py-2 text-fg">
                  <Link
                    href={`/admin/projects/${r.projectId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {r.projectSlug}
                  </Link>
                </td>
                <td className="px-1.5 py-2 text-mono-sm text-fg">
                  {formatSol(r.totalLamports, 4)}
                </td>
                <td className="px-1.5 py-2 text-mono-sm">{r.attemptCount}</td>
                <td
                  className="max-w-[18rem] truncate px-1.5 py-2 text-fg-secondary"
                  title={r.lastError ?? ""}
                >
                  {r.lastError ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function RecentAuditCard({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getAuditLogs>>;
}) {
  return (
    <Card depth="raised" padding="sm">
      <CardHeader className="px-1.5 pt-1">
        <CardTitle className="flex items-center gap-2">
          <Workflow className="size-4 text-fg-muted" /> Recent audit (last 1h)
        </CardTitle>
        <CardDescription>
          {rows.length} entries · open{" "}
          <Link href="/admin/audit" className="underline underline-offset-2">
            full log
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <li className="px-1.5 py-3 text-body-sm text-fg-muted">
            No audit entries in the last hour.
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 hover:bg-surface-elevated/40"
            >
              <span className="truncate text-body-sm text-fg">
                <span className="text-mono-sm text-fg-muted">{r.action}</span>{" "}
                <span className="text-fg-secondary">
                  · {r.actorName ?? "system"}
                </span>
              </span>
              <RelativeTime
                date={r.createdAt}
                className="shrink-0 text-mono-sm text-fg-muted"
              />
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function HealthCard({ summary }: { summary: HealthSummary }) {
  return (
    <Card depth="raised" padding="sm">
      <CardHeader className="px-1.5 pt-1">
        <CardTitle className="flex items-center gap-2">
          <Coins className="size-4 text-fg-muted" /> Bags + GitHub health
        </CardTitle>
        <CardDescription>
          30s cache. Detail at /admin/integrations.
        </CardDescription>
      </CardHeader>
      <dl className="mt-2 space-y-2 px-1.5">
        <HealthRow
          label="Bags client"
          ok={summary.bags.ok}
          latencyMs={summary.bags.latencyMs}
        />
        <HealthRow
          label="GitHub API"
          ok={summary.github.ok}
          latencyMs={summary.github.latencyMs}
        />
      </dl>
      <div className="mt-3 flex items-center justify-between px-1.5">
        <Pill
          variant={summary.bags.ok && summary.github.ok ? "success" : "danger"}
          size="sm"
        >
          {summary.bags.ok && summary.github.ok ? "All green" : "Degraded"}
        </Pill>
        <Link
          href="/admin/integrations"
          className="text-label-sm text-fg-secondary underline-offset-2 hover:underline"
        >
          View integrations →
        </Link>
      </div>
    </Card>
  );
}

function HealthRow({
  label,
  ok,
  latencyMs,
}: {
  label: string;
  ok: boolean;
  latencyMs: number | null;
}) {
  return (
    <div className="flex items-center justify-between text-body-sm">
      <span className="flex items-center gap-2 text-fg">
        <span
          className={cn("size-2 rounded-full", ok ? "bg-success" : "bg-danger")}
          aria-hidden
        />
        {label}
      </span>
      <span className="text-mono-sm text-fg-muted">
        {latencyMs == null ? "—" : `${latencyMs} ms`}
      </span>
    </div>
  );
}
