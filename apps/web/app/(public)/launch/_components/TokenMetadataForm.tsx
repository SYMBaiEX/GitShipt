"use client";

import * as React from "react";
import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { z } from "zod";
import { cn } from "@repo/lib";
import { Button } from "@repo/ui";
import { Input } from "@repo/ui";
import { FormField } from "@/components/shared/FormField";
import {
  RepoEnrichmentSchema,
  TokenMetadataSchema,
  type RepoEnrichment,
  type TokenMetadataInput,
  type GithubRepo,
} from "@repo/shared";
import {
  deriveSymbolFromRepo,
  deriveTokenMetadataDefaults,
} from "@/lib/state/launch-wizard-store";

/**
 * Client-side schema layered on top of the shared Zod contract.
 *
 *   - Mirrors `TokenMetadataSchema` for `name`, `description`, `imageUrl`.
 *   - Tightens `symbol` to a 2-10 uppercase-and-digit constraint per the
 *     wizard polish spec (the server still accepts 1-10 from the canonical
 *     schema; this is a stricter UX hint, not a security boundary).
 *
 * Important: the form's submit shape is unchanged — the same TokenMetadataInput
 * is posted to the server action.
 */
const ClientTokenSchema = TokenMetadataSchema.extend({
  symbol: z
    .string()
    .trim()
    .min(2, "Symbol must be at least 2 characters")
    .max(10, "Max 10 characters")
    .regex(/^[A-Z0-9]+$/, "Uppercase letters and numbers only"),
});

export interface TokenMetadataFormProps {
  repo: GithubRepo;
  initial: TokenMetadataInput | null;
  onBack: () => void;
  onSubmit: (data: TokenMetadataInput) => void;
}

export function TokenMetadataForm({
  repo,
  initial,
  onBack,
  onSubmit,
}: TokenMetadataFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isValid },
  } = useForm<TokenMetadataInput>({
    resolver: zodResolver(ClientTokenSchema),
    mode: "onBlur",
    defaultValues: initial ?? deriveTokenMetadataDefaults(repo),
  });
  const preview = useWatch({ control });
  const previewImage = safeImageUrl(preview.imageUrl, repo.ownerAvatarUrl);

  const [enrichment, setEnrichment] = React.useState<RepoEnrichment | null>(
    null,
  );

  // Lazily fetch owner socials + README excerpt + OG banner. Auto-fills only
  // empty/template fields so we never overwrite a value the user already
  // edited or that the store seeded from the cheap list payload.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/github/me/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/enrich`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const parsed = RepoEnrichmentSchema.safeParse(await res.json());
        if (!parsed.success || cancelled) return;
        setEnrichment(parsed.data);

        const current = getValues();
        const fallbackDescription = templateDescription(repo);

        if (
          parsed.data.readmeExcerpt &&
          (!current.description || current.description === fallbackDescription)
        ) {
          setValue("description", parsed.data.readmeExcerpt.slice(0, 1000), {
            shouldValidate: true,
          });
        }

        if (!current.website && parsed.data.ownerTwitterUsername === null) {
          // Fall back to owner blog if no homepage and no twitter (rare combo,
          // but blog is real owner-curated metadata when present).
          const blog = normalizeUrlOrEmpty(parsed.data.ownerBlog);
          if (blog) setValue("website", blog, { shouldValidate: true });
        }

        if (!current.twitter && parsed.data.ownerTwitterUsername) {
          setValue(
            "twitter",
            `https://x.com/${parsed.data.ownerTwitterUsername}`,
            { shouldValidate: true },
          );
        }
      } catch {
        // Enrichment is best-effort; the user can fill these fields manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, setValue, getValues]);

  function useBannerImage() {
    if (enrichment?.ogImageUrl) {
      setValue("imageUrl", enrichment.ogImageUrl, { shouldValidate: true });
    }
  }

  function useOwnerAvatar() {
    setValue("imageUrl", repo.ownerAvatarUrl, { shouldValidate: true });
  }

  return (
    <form
      onSubmit={handleSubmit((data) => onSubmit(data))}
      className="space-y-5"
    >
      <header className="space-y-2">
        <h2 className="text-headline-sm">Token metadata</h2>
        <RepoTagStrip repo={repo} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <FormField
              label="Name"
              hint="Up to 32 characters."
              error={errors.name?.message}
              required
            >
              <Input
                type="text"
                maxLength={32}
                autoComplete="off"
                {...register("name")}
              />
            </FormField>

            <FormField
              label="Symbol"
              hint="A-Z, 0-9 only. 2-10 characters."
              error={errors.symbol?.message}
              required
            >
              <Input
                type="text"
                maxLength={10}
                autoComplete="off"
                className="text-mono-md uppercase"
                {...register("symbol", {
                  setValueAs: (v: string) => (v ?? "").toUpperCase(),
                })}
              />
            </FormField>
          </div>

          <FormField
            label="Description"
            hint="Required. Up to 1000 characters. Shows on Bags.fm and your project page."
            error={errors.description?.message}
            required
          >
            <textarea
              rows={5}
              maxLength={1000}
              {...register("description")}
              className={cn(
                "w-full resize-none rounded-md border border-border-strong bg-surface px-3 py-2",
                "text-body-md text-fg outline-none placeholder:text-fg-muted",
                "transition-[border-color,box-shadow] duration-150",
                "focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-inset-light",
                "aria-[invalid=true]:border-danger",
              )}
            />
          </FormField>

          <FormField
            label="Image URL"
            hint="Square image works best. Defaults to your GitHub avatar."
            error={errors.imageUrl?.message}
            required
          >
            <Input type="url" autoComplete="off" {...register("imageUrl")} />
          </FormField>
          {enrichment?.ogImageUrl ? (
            <div className="-mt-3 flex items-center gap-3 text-caption text-fg-muted">
              <button
                type="button"
                onClick={useBannerImage}
                className="text-primary-readable hover:underline"
              >
                Use repo social banner
              </button>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={useOwnerAvatar}
                className="hover:text-fg hover:underline"
              >
                Use {repo.owner} avatar
              </button>
            </div>
          ) : null}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="rounded-lg border border-border bg-surface-elevated/40 p-3">
            <div className="flex items-start gap-3">
              <Image
                src={previewImage}
                alt=""
                width={48}
                height={48}
                className="size-10 shrink-0 rounded-lg bg-surface object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-label-md text-fg">
                  {preview.name || repo.name}
                </p>
                <p className="text-mono-sm text-fg-muted">
                  ${preview.symbol || deriveSymbolFromRepo(repo.name)}
                </p>
                <p className="mt-2 line-clamp-3 text-body-sm text-fg-secondary">
                  {preview.description || defaultDescription(repo)}
                </p>
              </div>
            </div>
          </div>

          <details className="group rounded-lg border border-border bg-surface-elevated/40">
            <summary className="gb-control gb-control-ghost flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-label-md text-fg">
              Optional links
              <span className="text-caption text-fg-muted">
                {
                  [preview.website, preview.twitter, preview.telegram].filter(
                    Boolean,
                  ).length
                }
                /3
              </span>
            </summary>
            <div className="grid gap-3 border-t border-border p-3">
              <FormField
                label="Website"
                hint="Optional."
                error={errors.website?.message}
              >
                <Input type="url" autoComplete="off" {...register("website")} />
              </FormField>
              <FormField
                label="X / Twitter"
                hint="Optional full URL."
                error={errors.twitter?.message}
              >
                <Input type="url" autoComplete="off" {...register("twitter")} />
              </FormField>
              <FormField
                label="Telegram"
                hint="Optional full URL."
                error={errors.telegram?.message}
              >
                <Input
                  type="url"
                  autoComplete="off"
                  {...register("telegram")}
                />
              </FormField>
            </div>
          </details>
        </aside>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button type="submit" disabled={!isValid}>
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  );
}

function defaultDescription(repo: GithubRepo): string {
  const description = repo.description?.trim();
  if (description) return description.slice(0, 1000);
  return templateDescription(repo);
}

function templateDescription(repo: GithubRepo): string {
  return `Token for ${repo.owner}/${repo.name}. Fees route to top contributors through Bags.`;
}

function safeImageUrl(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}

// GitHub `homepage` is often "example.com" without a scheme; the Zod URL check
// rejects that. Prepend https when missing, and return "" instead of null so
// react-hook-form's optional-or-empty-string handling stays happy.
function normalizeUrlOrEmpty(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return "";
  }
}

function RepoTagStrip({ repo }: { repo: GithubRepo }) {
  const tags: string[] = [];
  if (repo.language) tags.push(repo.language);
  for (const t of repo.topics.slice(0, 4)) tags.push(t);
  if (repo.license) tags.push(repo.license.toUpperCase());
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-caption text-fg-secondary"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
