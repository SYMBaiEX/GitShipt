import { Suspense } from "react";
import { Banknote, KeyRound, ShieldCheck, Sparkles, Split } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { Card, CardHeader, CardTitle, CardDescription } from "@repo/ui";
import { Badge } from "@repo/ui";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";
import {
  getAuditLogs,
  getPartnerFeeShareSummary,
  getPlatformConfigValue,
} from "@/lib/queries/admin";
import { hasCredentials, productionReadiness, serverEnv } from "@/lib/env";
import { bags } from "@/lib/bags/client";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import { formatAddress, formatRelativeTime } from "@repo/lib";
import { FeesForm } from "./_components/FeesForm";
import { PartnerFeesClaimForm } from "./_components/PartnerFeesClaimForm";


export default function AdminFeesPage() {
  return (
    <Suspense fallback={null}>
      <AdminFeesPageContent />
    </Suspense>
  );
}

async function AdminFeesPageContent() {
  await requireAdminPage("admin.access", "/admin");

  const stored = await getPlatformConfigValue<{
    value: number;
    updatedBy: string;
  }>("fees.platform_bps");
  const env = serverEnv();
  const envDefault = env.PLATFORM_FEE_BPS_DEFAULT;
  const currentBps = stored?.value ?? envDefault;
  const readiness = productionReadiness();
  let partnerStats: { claimedFees: string; unclaimedFees: string } | null =
    null;
  let partnerStatsError: string | null = null;
  if (hasCredentials.bags() && env.BAGS_PARTNER_CONFIG_KEY) {
    try {
      partnerStats = await bags.getPartnerClaimStats(env.BAGS_PARTNER_WALLET);
    } catch (error) {
      partnerStatsError =
        error instanceof Error ? error.message : "Partner fee stats failed.";
    }
  }
  let payoutSignerWallet: string | null = null;
  try {
    payoutSignerWallet = payoutSignerPublicKey();
  } catch {
    payoutSignerWallet = null;
  }
  const partnerClaimUnavailableReason = !env.BAGS_PARTNER_CONFIG_KEY
    ? "Set BAGS_PARTNER_CONFIG_KEY before claiming partner revenue."
    : !hasCredentials.bags()
      ? "Set BAGS_API_KEY before claiming partner revenue."
      : payoutSignerWallet !== env.BAGS_PARTNER_WALLET
        ? "Server-side claiming requires BAGS_PARTNER_WALLET to match SOLANA_PAYOUT_KEYPAIR; otherwise claim through the Bags Dev Dashboard."
        : partnerStats && BigInt(partnerStats.unclaimedFees) <= 0n
          ? "No unclaimed partner fees are available."
          : null;
  const [summary, auditRows] = await Promise.all([
    getPartnerFeeShareSummary(),
    getAuditLogs({
      actionPrefixes: [
        "fees",
        "treasury",
        "project.launch",
        "project.api_key",
        "admin",
      ],
      sinceHours: 24,
      limit: 50,
    }),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-headline-md">Platform fees</h1>
        <p className="text-body-sm text-fg-secondary">
          Operator view for GitShipt fee share, Bags partner attribution, and
          API-key security posture.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card depth="raised" padding="default">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-4 text-fg-muted" /> Platform fee BPS
            </CardTitle>
            <CardDescription>
              Global default for new launches. Draft projects can be overridden
              from their admin detail page before Bags launch config is created.
            </CardDescription>
          </CardHeader>
          <FeesForm currentBps={currentBps} />
          <div className="mt-3 flex items-center gap-2 text-caption text-fg-muted">
            <Badge variant="default" size="sm">
              env default
            </Badge>
            <span className="text-mono-sm">{envDefault} bps</span>
          </div>
        </Card>

        <Card depth="raised" padding="default">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-fg-muted" /> Bags partner rail
            </CardTitle>
            <CardDescription>
              Server-only partner attribution used by launch intents and Bags
              SDK calls. Secrets stay outside the client bundle.
            </CardDescription>
          </CardHeader>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-body-sm sm:grid-cols-2">
            <InfoRow
              label="Partner wallet"
              value={formatAddress(env.BAGS_PARTNER_WALLET, 6, 4)}
            />
            <InfoRow label="Ref code" value={env.BAGS_REF_CODE} />
            <InfoRow
              label="Partner config"
              value={
                env.BAGS_PARTNER_CONFIG_KEY
                  ? formatAddress(env.BAGS_PARTNER_CONFIG_KEY, 6, 4)
                  : "not set"
              }
            />
            <InfoRow
              label="Config type"
              value={env.BAGS_CONFIG_TYPE ?? "default"}
            />
            <InfoRow
              label="Bags credentials"
              value={hasCredentials.bags() ? "live SDK" : "stub fallback"}
              tone={hasCredentials.bags() ? "success" : "warning"}
            />
            <InfoRow
              label="Readiness"
              value={readiness.ok ? "ready" : "attention needed"}
              tone={readiness.ok ? "success" : "danger"}
            />
          </dl>
          <PartnerFeesClaimForm
            partnerWallet={env.BAGS_PARTNER_WALLET}
            partnerConfigSet={Boolean(env.BAGS_PARTNER_CONFIG_KEY)}
            stats={partnerStats}
            statsError={partnerStatsError}
            serverClaimAvailable={
              payoutSignerWallet === env.BAGS_PARTNER_WALLET
            }
            unavailableReason={partnerClaimUnavailableReason}
          />
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MetricCard
          icon={Split}
          title="Fee-share rollout"
          rows={[
            ["Configured projects", summary.feeShareConfiguredProjects],
            ["Launched tokens", summary.launchedProjects],
            ["Live launched", summary.liveLaunchedProjects],
            ["Not Live launches", summary.simulatedProjects],
            ["Missing pool claimer", summary.missingPoolClaimerProjects],
          ]}
          footer={
            summary.latestLaunchUpdatedAt
              ? `Latest launch update ${formatRelativeTime(summary.latestLaunchUpdatedAt)}`
              : "No launch config rows yet"
          }
        />
        <MetricCard
          icon={Banknote}
          title="BPS envelope"
          rows={[
            ["Current global", `${currentBps} bps`],
            ["Average project", `${summary.avgPlatformFeeBps} bps`],
            ["Minimum project", `${summary.minPlatformFeeBps} bps`],
            ["Maximum project", `${summary.maxPlatformFeeBps} bps`],
            ["Contributor pool", `${10_000 - currentBps} bps`],
          ]}
        />
        <MetricCard
          icon={KeyRound}
          title="API-key status"
          rows={[
            ["Active project keys", summary.activeApiKeys],
            ["Used last 24h", summary.apiKeysUsedLast24h],
            [
              "Last key use",
              summary.lastApiKeyUsedAt
                ? formatRelativeTime(summary.lastApiKeyUsedAt)
                : "never",
            ],
            [
              "Redis MFA cache",
              hasCredentials.redis() ? "configured" : "missing",
            ],
            ["DB-backed audit", hasCredentials.db() ? "configured" : "missing"],
          ]}
          footer="API keys are project-scoped; raw values are never persisted."
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1.5">
          <ShieldCheck className="size-4 text-fg-muted" />
          <div>
            <h2 className="text-headline-sm">
              Fee, partner, and security audit
            </h2>
            <p className="text-body-sm text-fg-secondary">
              Last 24h across fee updates, Bags launch operations, API-key
              lifecycle, treasury actions, and admin access.
            </p>
          </div>
        </div>
        <AuditLogViewer
          rows={auditRows}
          activePrefix="all"
          basePath="/admin/audit"
          sinceHours={24}
        />
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface-elevated/60 px-3 py-2">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd
        className={
          tone === "success"
            ? "text-mono-sm text-success"
            : tone === "warning"
              ? "text-mono-sm text-warning"
              : tone === "danger"
                ? "text-mono-sm text-danger"
                : "text-mono-sm text-fg"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  rows,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: Array<[string, string | number]>;
  footer?: string;
}) {
  return (
    <Card depth="flat" padding="sm">
      <CardHeader className="px-1.5 pt-1">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-fg-muted" /> {title}
        </CardTitle>
      </CardHeader>
      <dl className="mt-2 space-y-2 px-1.5 text-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-fg-secondary">{label}</dt>
            <dd className="text-mono-sm text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      {footer ? (
        <p className="mt-3 border-t border-border/50 px-1.5 pt-2 text-caption text-fg-muted">
          {footer}
        </p>
      ) : null}
    </Card>
  );
}
