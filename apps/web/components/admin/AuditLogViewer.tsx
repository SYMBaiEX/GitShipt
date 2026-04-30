import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { FileSearch } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@repo/ui";
import { Pill } from "@repo/ui";
import { Badge } from "@repo/ui";
import { formatRelativeTime, formatAddress } from "@repo/lib";
import { cn } from "@repo/lib";
import type { AuditRow } from "@/lib/queries/admin";

const PREFIXES = [
  { key: "all", label: "All" },
  { key: "auth", label: "Auth" },
  { key: "project.launch", label: "Bags launches" },
  { key: "project.api_key", label: "API keys" },
  { key: "project", label: "Projects" },
  { key: "payout", label: "Payouts" },
  { key: "snapshot", label: "Snapshots" },
  { key: "fees", label: "Fees" },
  { key: "kill_switch", label: "Kill switch" },
  { key: "user", label: "Users" },
  { key: "admin", label: "Admin" },
  { key: "treasury", label: "Treasury" },
  { key: "abuse", label: "Abuse" },
] as const;

/**
 * Server-rendered audit log table with filter chips. The chips are rendered
 * as `<Link>`s so server actions are unnecessary — the page consumes the
 * `?prefix=` searchParam.
 */
export function AuditLogViewer({
  rows,
  activePrefix = "all",
  basePath = "/admin/audit",
  targetId,
  targetType,
  sinceHours,
}: {
  rows: AuditRow[];
  activePrefix?: string;
  basePath?: string;
  targetId?: string;
  targetType?: string;
  sinceHours?: number;
}) {
  return (
    <Card depth="flat" padding="sm" className="space-y-3">
      <CardHeader className="px-2 pt-1">
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="size-4 text-fg-muted" /> Audit log
        </CardTitle>
        <CardDescription>
          Append-only. The application DB role does not have UPDATE / DELETE on
          this table.
        </CardDescription>
      </CardHeader>

      <div className="flex flex-wrap items-center gap-1.5 px-2">
        {PREFIXES.map((p) => {
          const href = auditHref(basePath, {
            prefix: p.key === "all" ? undefined : p.key,
            targetId,
            targetType,
            sinceHours,
          });
          const active = activePrefix === p.key;
          return (
            <Link key={p.key} href={href}>
              <Pill
                variant={active ? "primary" : "neutral"}
                size="sm"
                interactive
              >
                {p.label}
              </Pill>
            </Link>
          );
        })}
      </div>

      {targetId || targetType ? (
        <div className="flex flex-wrap items-center gap-2 px-2 text-caption text-fg-muted">
          <span>Filtered</span>
          {targetType ? (
            <Badge variant="default" size="sm">
              targetType={targetType}
            </Badge>
          ) : null}
          {targetId ? (
            <Badge variant="default" size="sm">
              targetId={formatAddress(targetId, 6, 4)}
            </Badge>
          ) : null}
          <Link
            href={auditHref(basePath, { prefix: activePrefix })}
            className="underline underline-offset-2"
          >
            clear target
          </Link>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-2 py-6 text-center text-body-sm text-fg-muted">
          No audit entries match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="text-label-sm text-fg-muted">
              <tr className="border-b border-border/60">
                <th className="px-2 py-2 font-medium">When</th>
                <th className="px-2 py-2 font-medium">Actor</th>
                <th className="px-2 py-2 font-medium">Action</th>
                <th className="px-2 py-2 font-medium">Target</th>
                <th className="px-2 py-2 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <AuditRowEl key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function auditHref(
  basePath: string,
  params: {
    prefix?: string;
    targetId?: string;
    targetType?: string;
    sinceHours?: number;
  },
): string {
  const query = new URLSearchParams();
  if (params.prefix && params.prefix !== "all") {
    query.set("prefix", params.prefix);
  }
  if (params.targetId) query.set("targetId", params.targetId);
  if (params.targetType) query.set("targetType", params.targetType);
  if (params.sinceHours) query.set("sinceHours", String(params.sinceHours));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function AuditRowEl({ row }: { row: AuditRow }) {
  const variant = actionVariant(row.action);
  const targetShort =
    row.targetId.length > 12 ? formatAddress(row.targetId, 6, 4) : row.targetId;

  return (
    <tr className="border-b border-border/30 hover:bg-surface-elevated/40">
      <td
        className="whitespace-nowrap px-2 py-2 text-mono-sm text-fg-secondary"
        title={row.createdAt.toISOString()}
      >
        {formatRelativeTime(row.createdAt)}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          {row.actorAvatar ? (
            <Image
              src={row.actorAvatar}
              alt=""
              width={20}
              height={20}
              sizes="20px"
              className="size-5 shrink-0 rounded-full"
            />
          ) : (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-elevated text-caption text-fg-muted">
              {(row.actorName ?? "·").slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate text-fg">
            {row.actorName ?? <span className="text-fg-muted">system</span>}
          </span>
        </div>
      </td>
      <td className="px-2 py-2">
        <Badge variant={variant} size="sm">
          {row.action}
        </Badge>
      </td>
      <td className="px-2 py-2 text-mono-sm text-fg-secondary">
        <span title={`${row.targetType}:${row.targetId}`}>
          <span className="text-fg-muted">{row.targetType}:</span>
          {targetShort}
        </span>
      </td>
      <td className="max-w-[20rem] px-2 py-2 align-top">
        <details className="group">
          <summary
            className={cn(
              "gb-menu-item inline-flex cursor-pointer list-none rounded-sm px-1.5 py-0.5 text-caption text-fg-muted",
              "group-open:text-fg-secondary",
            )}
          >
            {Object.keys(row.metadata).length > 0
              ? `${Object.keys(row.metadata).length} keys`
              : "—"}
          </summary>
          {Object.keys(row.metadata).length > 0 ? (
            <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border/50 bg-surface-elevated p-2 text-mono-sm text-fg-secondary">
              {JSON.stringify(row.metadata, null, 2)}
            </pre>
          ) : null}
        </details>
      </td>
    </tr>
  );
}

function actionVariant(
  action: string,
): "default" | "primary" | "success" | "warning" | "danger" | "info" {
  if (action.startsWith("payout")) return "info";
  if (action.startsWith("project.kill") || action.startsWith("kill_switch"))
    return "danger";
  if (action.startsWith("project.launch")) return "success";
  if (action.startsWith("project.api_key")) return "warning";
  if (action.startsWith("project.pause") || action.startsWith("project.delete"))
    return "warning";
  if (action.startsWith("auth")) return "primary";
  if (action.startsWith("snapshot")) return "info";
  if (action.startsWith("fees") || action.startsWith("treasury"))
    return "warning";
  return "default";
}
