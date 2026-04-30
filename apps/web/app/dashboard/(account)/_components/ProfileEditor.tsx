"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@repo/ui";
import { FormError, FormField } from "@/components/shared";
import {
  refreshGithubIdentity,
  updateAccountProfile,
} from "../actions";

export function ProfileEditor({
  name: initialName,
  image: initialImage,
  githubConnected,
}: {
  name: string;
  image: string | null;
  githubConnected: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [imageUrl, setImageUrl] = React.useState(initialImage ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateAccountProfile({
          name,
          imageUrl,
          idempotencyKey: `profile-${Date.now()}`,
        });
        setSaved(true);
        toast.success("Profile updated");
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Profile save failed.";
        setError(message);
        toast.error(message);
      }
    });
  }

  function syncGithub() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await refreshGithubIdentity({
          idempotencyKey: `github-sync-${Date.now()}`,
        });
        setSaved(true);
        toast.success("GitHub identity refreshed");
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "GitHub sync failed.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      {error ? (
        <FormError message={error} onDismiss={() => setError(null)} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[80px_minmax(0,1fr)]">
        <PreviewAvatar imageUrl={imageUrl} name={name} />
        <div className="grid gap-3">
          <FormField label="Display name" htmlFor="profile-name" required>
            <Input
              id="profile-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </FormField>
          <FormField
            label="Avatar URL"
            htmlFor="profile-image"
            hint="Leave empty to show initials."
          >
            <Input
              id="profile-image"
              type="url"
              value={imageUrl}
              maxLength={500}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://github.com/avatar.png"
            />
          </FormField>
        </div>
      </div>

      {saved ? (
        <p className="text-body-sm text-success" role="status">
          Saved.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          <Save className="size-4" />
          {pending ? "Saving..." : "Save profile"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !githubConnected}
          onClick={syncGithub}
          title={
            githubConnected
              ? "Refresh GitHub username and avatar"
              : "Connect GitHub before syncing"
          }
        >
          <RefreshCw className="size-4" />
          Sync GitHub
        </Button>
      </div>
    </form>
  );
}

function PreviewAvatar({
  imageUrl,
  name,
}: {
  imageUrl: string;
  name: string;
}) {
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const safeImage = imageUrl.trim();

  if (safeImage && brokenUrl !== safeImage) {
    return (
      <Image
        src={safeImage}
        alt=""
        width={80}
        height={80}
        onError={() => setBrokenUrl(safeImage)}
        className="size-20 rounded-lg border border-border object-cover"
      />
    );
  }

  return (
    <div className="grid size-20 place-items-center rounded-lg border border-border bg-surface-elevated text-headline-md text-fg">
      {initial}
    </div>
  );
}
