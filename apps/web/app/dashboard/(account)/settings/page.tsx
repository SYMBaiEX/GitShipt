import { Github } from "@repo/ui";
import { Suspense } from "react";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  Bell,
  ChevronRight,
  KeyRound,
  Settings,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import {
  getAccountProfile,
  getAccountSettings,
  getAccountSecurityState,
} from "@/lib/queries/account";
import { getMyLinkedWallets } from "@/lib/queries/dashboard";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { AccountPreferencesForm } from "../_components/AccountPreferencesForm";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}

async function SettingsPageContent() {
  if (!hasCredentials.db()) {
    return (
      <div className="mx-auto w-full max-w-content">
        <EmptyState
          icon={Settings}
          title="Stub mode"
          description="Set DATABASE_URL or POSTGRES_URL to manage account settings."
        />
      </div>
    );
  }

  const session = await requireAuthSession("/dashboard/settings");
  const [profile, security, settings, wallets] = await Promise.all([
    getAccountProfile(session.user.id),
    getAccountSecurityState(session.user.id),
    getAccountSettings(session.user.id),
    getMyLinkedWallets(session.user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Stored on your GitShipt account and applied to account navigation.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-5">
            <AccountPreferencesForm settings={settings} />
          </CardContent>
        </Card>

        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <CardTitle>Account areas</CardTitle>
            <CardDescription>
              Linked account surfaces with their current state.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <SettingsLink
              href="/dashboard/profile"
              icon={UserRound}
              label="Profile"
              detail={
                profile?.githubUsername
                  ? `Public profile /u/${profile.githubUsername}`
                  : "Name, email, and account identity"
              }
              status={
                profile?.githubConnected ? "GitHub linked" : "Needs GitHub"
              }
            />
            <SettingsLink
              href="/dashboard/security"
              icon={ShieldCheck}
              label="Security"
              detail="Authenticator app and active session posture"
              status={security?.mfaEnrolled ? "MFA enabled" : "MFA off"}
              tone={security?.mfaEnrolled ? "success" : "warning"}
            />
            <SettingsLink
              href="/dashboard/wallets"
              icon={Wallet}
              label="Wallets"
              detail="Wallet attestations for launch signing and account security"
              status={`${wallets.length} linked`}
            />
            <SettingsLink
              href="/dashboard/projects"
              icon={Github}
              label="Projects"
              detail="Repositories you own or co-administer"
              status="Project scoped"
            />
            <SettingsLink
              href="/dashboard/api-keys"
              icon={KeyRound}
              label="API keys"
              detail="Project-scoped keys for integrations and webhooks"
              status="Per project"
            />
            <SettingsLink
              href="/dashboard/earnings"
              icon={Bell}
              label="Earnings"
              detail="Contribution earnings overview and Bags claim handoff"
              status={wallets.length > 0 ? "Ready" : "Link wallet"}
              tone={wallets.length > 0 ? "success" : "warning"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsLink({
  href,
  icon: Icon,
  label,
  detail,
  status,
  tone = "default",
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  status: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <Link
      href={href}
      className="group grid gap-3 px-6 py-4 transition-colors hover:bg-surface-elevated/50 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface text-primary-readable">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-label-md text-fg">{label}</div>
          <div className="mt-1 text-body-sm text-fg-secondary">{detail}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Badge
          variant={
            tone === "success"
              ? "success"
              : tone === "warning"
                ? "warning"
                : "default"
          }
          size="sm"
        >
          {status}
        </Badge>
        <ChevronRight
          className="size-4 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
          aria-hidden
        />
      </div>
    </Link>
  );
}
