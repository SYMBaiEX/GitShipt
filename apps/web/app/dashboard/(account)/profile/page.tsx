import { Github } from "@repo/ui";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import { Calendar, ShieldCheck, UserRound } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import { getAccountProfile } from "@/lib/queries/account";
import { formatRelativeTime } from "@repo/lib";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProfileEditor } from "../_components/ProfileEditor";

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageContent />
    </Suspense>
  );
}

async function ProfilePageContent() {
  if (!hasCredentials.db()) {
    return (
      <div className="mx-auto w-full max-w-content">
        <EmptyState
          icon={UserRound}
          title="Stub mode"
          description="Set DATABASE_URL or POSTGRES_URL to view your profile."
        />
      </div>
    );
  }

  const session = await requireAuthSession("/dashboard/profile");
  const profile = await getAccountProfile(session.user.id);

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-content">
        <EmptyState
          icon={UserRound}
          title="Profile unavailable"
          description="Your account session is valid, but the profile row could not be loaded."
        />
      </div>
    );
  }

  const handle = profile.githubUsername ? `@${profile.githubUsername}` : null;

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Card depth="raised" padding="default">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar image={profile.image} name={profile.name} />
            <div className="min-w-0">
              <h1 className="truncate text-headline-lg text-fg">
                {profile.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-fg-secondary">
                {handle ? <span className="text-mono-sm">{handle}</span> : null}
                <span>{profile.email}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.githubUsername ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/u/${profile.githubUsername}`}>
                  Public profile
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/settings">Settings</Link>
            </Button>
          </div>
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ProfileStat
          icon={Github}
          label="GitHub"
          value={profile.githubConnected ? "Connected" : "Not connected"}
          detail={
            profile.githubConnectedAt
              ? `connected ${formatRelativeTime(profile.githubConnectedAt)}`
              : "sign in with GitHub to reconnect"
          }
        />
        <ProfileStat
          icon={ShieldCheck}
          label="Role"
          value={profile.role.replace("_", " ")}
          detail={profile.emailVerified ? "email verified" : "email unverified"}
        />
        <ProfileStat
          icon={Calendar}
          label="Account age"
          value={formatRelativeTime(profile.createdAt)}
          detail={`${profile.activeSessionCount} active session${profile.activeSessionCount === 1 ? "" : "s"}`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <CardTitle>Account identity</CardTitle>
            <CardDescription>
              GitHub identity is synced from OAuth; display fields are editable.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <Field label="User ID" value={profile.id} mono />
            <Field label="Name" value={profile.name} />
            <Field label="Email" value={profile.email} />
            <Field
              label="GitHub username"
              value={
                profile.githubUsername ? `@${profile.githubUsername}` : "—"
              }
              mono={Boolean(profile.githubUsername)}
            />
            <Field
              label="Last updated"
              value={profile.updatedAt.toISOString()}
              mono
            />
          </CardContent>
        </Card>

        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <CardTitle>Edit profile</CardTitle>
            <CardDescription>
              Changes update the account record and sidebar card.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-5">
            <ProfileEditor
              name={profile.name}
              image={profile.image}
              githubConnected={profile.githubConnected}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Avatar({ image, name }: { image: string | null; name: string }) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={64}
        height={64}
        className="size-16 rounded-lg border border-border object-cover"
      />
    );
  }
  return (
    <div className="grid size-16 place-items-center rounded-lg border border-border bg-surface-elevated text-headline-md text-fg">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ProfileStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card depth="flat" padding="default">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-caption text-fg-muted">{label}</div>
          <div className="mt-1 capitalize text-headline-sm text-fg">
            {value}
          </div>
          <div className="mt-1 text-body-sm text-fg-secondary">{detail}</div>
        </div>
        <Icon className="size-4 text-primary-readable" aria-hidden />
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-2 px-6 py-3 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="text-label-sm text-fg-muted">{label}</div>
      <div
        className={
          mono
            ? "break-all text-mono-sm text-fg"
            : "break-words text-body-sm text-fg"
        }
      >
        {value}
      </div>
    </div>
  );
}
