import { Suspense } from "react";
import Link from "next/link";
import { Coins, ExternalLink, Sparkles } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { getProjectPayoutHistory } from "@/lib/queries/dashboard";
import { formatSol, formatRelativeTime, formatAddress } from "@repo/lib";
import { loadProjectFor } from "../../../_components/loadProject";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Badge } from "@repo/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { RetryPayoutButton } from "./_components/RetryPayoutButton";
import { solscanTxUrl } from "@/lib/solana/explorer";


export default function PayoutsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PayoutsPageContent params={params} />
    </Suspense>
  );
}

async function PayoutsPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) return <Stub />;
  const { id } = await params;
  const ctx = await loadProjectFor(id, "payouts.read");
  const { project } = ctx;
  const rows = await getProjectPayoutHistory(id, 50);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${id}` },
          { label: "Payouts" },
        ]}
      />

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>
            {rows.length} payout{rows.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Sorted newest first. Click the tx signature to verify on Solscan.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Coins}
                title="No payouts yet"
                description="The first payout will execute right after the first daily snapshot."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/40 text-label-sm text-fg-muted">
                    <th className="px-6 py-2 text-left font-medium">When</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Recipients
                    </th>
                    <th className="px-4 py-2 text-left font-medium">Tx</th>
                    <th className="px-6 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="text-body-md transition-colors hover:bg-surface-elevated/40"
                    >
                      <td className="px-6 py-3">
                        <div className="text-fg">
                          {r.executedAt
                            ? formatRelativeTime(r.executedAt)
                            : "—"}
                        </div>
                        <div className="text-caption text-fg-muted">
                          attempt {r.attemptCount}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <PayoutStatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-mono-md text-primary-readable">
                        {formatSol(r.totalLamports, 4)}
                      </td>
                      <td className="px-4 py-3 text-right text-mono-md text-fg">
                        {r.recipientCount}
                      </td>
                      <td className="px-4 py-3">
                        {r.claimSignature ? (
                          <Link
                            href={solscanTxUrl(r.claimSignature)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-mono-sm text-primary-readable hover:underline"
                          >
                            {formatAddress(r.claimSignature, 6, 6)}
                            <ExternalLink className="size-3" />
                          </Link>
                        ) : (
                          <span className="text-mono-sm text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {r.status === "failed" ? (
                          <RetryPayoutButton projectId={id} payoutId={r.id} />
                        ) : (
                          <span className="text-caption text-fg-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayoutStatusBadge({
  status,
}: {
  status:
    | "pending"
    | "claiming"
    | "distributing"
    | "completed"
    | "failed"
    | "cancelled"
    | "simulated";
}) {
  const map = {
    pending: { variant: "default" as const, label: "Pending" },
    claiming: { variant: "info" as const, label: "Claiming" },
    distributing: { variant: "info" as const, label: "Distributing" },
    completed: { variant: "success" as const, label: "Completed" },
    failed: { variant: "danger" as const, label: "Failed" },
    cancelled: { variant: "warning" as const, label: "Cancelled" },
    simulated: { variant: "default" as const, label: "Not Live" },
  } as const;
  const v = map[status];
  return (
    <Badge variant={v.variant} size="sm" dot={status === "completed"}>
      {v.label}
    </Badge>
  );
}

function Stub() {
  return (
    <div className="mx-auto w-full max-w-content">
      <EmptyState
        icon={Sparkles}
        title="Stub mode"
        description="Set DATABASE_URL or POSTGRES_URL to view payouts."
      />
    </div>
  );
}
