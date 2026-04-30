import { Suspense } from "react";
import Link from "next/link";
import { Coins } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { Card, CardHeader, CardTitle, CardDescription } from "@repo/ui";
import { Pill } from "@repo/ui";
import { Badge } from "@repo/ui";
import { getAllPayouts } from "@/lib/queries/admin";
import { formatRelativeTime, formatSol } from "@repo/lib";
import { PayoutRowActions } from "./_components/PayoutRowActions";


const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "claiming", label: "Claiming" },
  { key: "distributing", label: "Distributing" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <AdminPayoutsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminPayoutsPageContent({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "all";

  await requireAdminPage("admin.access", "/admin");

  const rows = await getAllPayouts({ status });

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-headline-md">Payouts</h1>
          <p className="text-body-sm text-fg-secondary">
            Global queue across all projects.
          </p>
        </div>
        <Badge size="sm" variant="default">
          {rows.length} rows
        </Badge>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const href =
            f.key === "all"
              ? "/admin/payouts"
              : `/admin/payouts?status=${f.key}`;
          const active = status === f.key;
          return (
            <Link key={f.key} href={href}>
              <Pill
                variant={active ? "primary" : "neutral"}
                size="sm"
                interactive
              >
                {f.label}
              </Pill>
            </Link>
          );
        })}
      </div>

      <Card depth="flat" padding="none" className="overflow-hidden">
        <CardHeader className="px-4 pt-4">
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-4 text-fg-muted" /> Queue
          </CardTitle>
          <CardDescription>
            Retry is idempotent (`payouts.retry`). Cancel is destructive
            (`payouts.cancel`) and triggers MFA + reason.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-elevated/50 text-label-sm text-fg-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Recipients</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Attempts</th>
                <th className="px-4 py-2 font-medium">Last error</th>
                <th className="px-4 py-2 font-medium">Scheduled</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-fg-muted"
                  >
                    No payouts.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-border/40 hover:bg-surface-elevated/40"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/projects/${r.projectId}`}
                        className="text-fg hover:underline"
                      >
                        {r.projectSlug}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-mono-sm">
                      {formatSol(r.totalLamports, 4)}
                    </td>
                    <td className="px-4 py-2 text-mono-sm">
                      {r.recipientCount}
                    </td>
                    <td className="px-4 py-2">
                      <PayoutStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2 text-mono-sm">{r.attemptCount}</td>
                    <td
                      className="max-w-[20rem] truncate px-4 py-2 text-fg-secondary"
                      title={r.lastError ?? ""}
                    >
                      {r.lastError ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-mono-sm text-fg-muted">
                      {formatRelativeTime(r.scheduledAt)}
                    </td>
                    <td className="px-4 py-2">
                      <PayoutRowActions
                        payoutId={r.id}
                        status={r.status}
                        snapshotId={r.snapshotId}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="success" size="sm">
          completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="danger" size="sm">
          failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="default" size="sm">
          cancelled
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="warning" size="sm">
          pending
        </Badge>
      );
    case "simulated":
      return (
        <Badge variant="default" size="sm">
          Not Live
        </Badge>
      );
    case "claiming":
    case "distributing":
      return (
        <Badge variant="info" size="sm" dot>
          {status}
        </Badge>
      );
    default:
      return (
        <Badge variant="default" size="sm">
          {status}
        </Badge>
      );
  }
}
