"use client";

import * as React from "react";
import { Rocket } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@repo/ui";
import {
  DEFAULT_CLAIM_THRESHOLD_LAMPORTS,
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_TOP_N,
  defaultTierWeights,
} from "@repo/shared";
import { directLaunchProject } from "@/app/admin/actions";

export function DirectLaunchForm() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    projectId: string;
    tokenMint: string;
    status: string;
  } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    const form = new FormData(event.currentTarget);
    const topN = Number(form.get("topN") ?? DEFAULT_TOP_N);
    try {
      const launch = await directLaunchProject({
        ghOwner: read(form, "ghOwner"),
        ghRepo: read(form, "ghRepo"),
        ghRepoId: read(form, "ghRepoId"),
        ghInstallationId: optional(form, "ghInstallationId"),
        name: read(form, "name"),
        symbol: read(form, "symbol").toUpperCase(),
        description: read(form, "description"),
        imageUrl: read(form, "imageUrl"),
        website: optional(form, "website"),
        twitter: optional(form, "twitter"),
        telegram: optional(form, "telegram"),
        platformFeeBps: Number(
          form.get("platformFeeBps") ?? DEFAULT_PLATFORM_FEE_BPS,
        ),
        scoringConfig: {
          ...DEFAULT_SCORING_CONFIG,
          windowDays: Number(
            form.get("windowDays") ?? DEFAULT_SCORING_CONFIG.windowDays,
          ),
        },
        payoutConfig: {
          topN,
          tierWeights: defaultTierWeights(topN),
          claimThresholdLamports: Number(
            form.get("claimThresholdLamports") ??
              DEFAULT_CLAIM_THRESHOLD_LAMPORTS,
          ),
        },
        idempotencyKey: `admin-direct-launch-${Date.now()}`,
      });
      setResult(launch);
      event.currentTarget.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Direct launch failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card depth="raised" padding="none">
      <CardHeader className="border-b border-border px-6 py-4">
        <CardTitle className="flex items-center gap-2">
          <Rocket className="size-4 text-fg-secondary" /> Launch token
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 py-5">
        <form onSubmit={onSubmit} className="space-y-5">
          <fieldset className="grid gap-3 md:grid-cols-2">
            <Field label="GitHub owner" name="ghOwner" required />
            <Field label="GitHub repo" name="ghRepo" required />
            <Field label="GitHub repo id" name="ghRepoId" required />
            <Field label="Installation id" name="ghInstallationId" />
          </fieldset>

          <fieldset className="grid gap-3 md:grid-cols-2">
            <Field label="Token name" name="name" required maxLength={32} />
            <Field label="Symbol" name="symbol" required maxLength={10} />
            <Field label="Image URL" name="imageUrl" required type="url" />
            <Field label="Website" name="website" type="url" />
            <Field label="Twitter/X" name="twitter" type="url" />
            <Field label="Telegram" name="telegram" type="url" />
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-label-sm text-fg-secondary">Description</span>
            <textarea
              name="description"
              rows={4}
              required
              maxLength={1000}
              className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-fg outline-none focus:border-primary"
            />
          </label>

          <fieldset className="grid gap-3 md:grid-cols-3">
            <Field
              label="Legacy treasury bps"
              name="platformFeeBps"
              type="number"
              defaultValue={DEFAULT_PLATFORM_FEE_BPS}
              min={0}
              required
            />
            <Field
              label="Scoring window"
              name="windowDays"
              type="number"
              defaultValue={DEFAULT_SCORING_CONFIG.windowDays}
              min={7}
              max={90}
              required
            />
            <Field
              label="Top N"
              name="topN"
              type="number"
              defaultValue={DEFAULT_TOP_N}
              min={3}
              max={50}
              required
            />
            <Field
              label="Claim threshold"
              name="claimThresholdLamports"
              type="number"
              defaultValue={DEFAULT_CLAIM_THRESHOLD_LAMPORTS}
              min={0}
              required
            />
          </fieldset>

          {error ? (
            <p className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-body-sm text-danger">
              {error}
            </p>
          ) : null}
          {result ? (
            <p className="rounded-md border border-success/40 bg-success-soft px-3 py-2 text-body-sm text-success">
              Launched {result.status}:{" "}
              <span className="text-mono-sm">{result.tokenMint}</span>
            </p>
          ) : null}

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" variant="primary" disabled={busy}>
              <Rocket className="size-4" />
              {busy ? "Launching..." : "Launch token"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  ...props
}: {
  label: string;
  name: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">) {
  return (
    <label className="block space-y-1.5">
      <span className="text-label-sm text-fg-secondary">{label}</span>
      <Input name={name} {...props} />
    </label>
  );
}

function read(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(form: FormData, key: string): string | undefined {
  const value = read(form, key);
  return value.length > 0 ? value : undefined;
}
