"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  GitFork,
  Loader2,
  Search,
  Star,
} from "lucide-react";
import { cn } from "@repo/lib";
import {
  ApiErrorResponseSchema,
  GithubReposResponseSchema,
  type GithubRepo,
  type GithubReposResponse,
} from "@repo/shared";

export interface RepoPickerProps {
  selectedId: string | null;
  onSelect: (repo: GithubRepo) => void;
}

interface FetchState {
  status: "idle" | "loading" | "success" | "error";
  data: GithubReposResponse | null;
  error: string | null;
}

export function RepoPicker({ selectedId, onSelect }: RepoPickerProps) {
  const router = useRouter();
  const [state, setState] = useState<FetchState>({
    status: "loading",
    data: null,
    error: null,
  });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/github/me/repos", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          const body = ApiErrorResponseSchema.safeParse(
            await res.json().catch(() => null),
          );
          const errorBody = body.success ? body.data : null;
          if (cancelled) return;
          setState({
            status: "error",
            data: null,
            error: friendlyError(
              res.status,
              errorBody?.error,
              errorBody?.message,
            ),
          });
          return;
        }
        const json = (await res.json()) as unknown;
        const parsed = GithubReposResponseSchema.safeParse(json);
        if (cancelled) return;
        if (!parsed.success) {
          setState({
            status: "error",
            data: null,
            error: "GitHub response shape is unexpected. Try again.",
          });
          return;
        }
        setState({ status: "success", data: parsed.data, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          data: null,
          error: e instanceof Error ? e.message : "Could not load repos.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!state.data) return [] as GithubRepo[];
    const q = query.trim().toLowerCase();
    if (!q) return state.data.repos;
    return state.data.repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
    );
  }, [state.data, query]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.38fr)_minmax(0,1fr)] lg:gap-8">
      <header className="space-y-2 lg:pt-1">
        <h2 className="text-headline-sm">Pick a repository</h2>
        <p className="text-body-md text-fg-secondary">
          Choose the GitHub repo to back this token. We verify your admin
          permission server-side at launch.
        </p>
        {state.data?.visibilityNote ? (
          <p className="rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-body-sm text-fg-muted">
            {state.data.visibilityNote}
          </p>
        ) : null}
      </header>

      <div className="min-w-0 space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by repo name or description"
            aria-label="Search repositories"
            className={cn(
              "h-10 w-full rounded-md border border-border-strong bg-surface px-3 pl-9",
              "text-body-md outline-none placeholder:text-fg-muted",
              "focus:border-primary",
            )}
          />
        </div>

        <div className="min-h-[360px] space-y-2">
          {state.status === "loading" ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-3 text-body-sm text-fg-secondary">
              <Loader2 className="size-4 animate-spin" />
              Loading your repositories...
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="flex items-start gap-3 rounded-md border border-danger bg-danger-soft p-3 text-body-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          {state.status === "success" && filtered.length === 0 ? (
            <div className="rounded-md border border-border bg-surface-elevated px-3 py-6 text-center text-body-sm text-fg-muted">
              {query
                ? "No repos match your search."
                : "No public admin-permission repos found on your GitHub account."}
            </div>
          ) : null}

          {filtered.length > 0 ? (
            <ul className="max-h-[min(58vh,34rem)] divide-y divide-border overflow-y-auto rounded-md border border-border bg-surface/60 [scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]">
              {filtered.map((repo) => {
                const isSelected = selectedId === repo.id;
                // Disable selection for repos with a real launched project
                // (status: live/paused/killed/simulated_live). For drafts
                // (status: draft/launch_configured) the row stays clickable
                // and routes to the project console so the user can resume.
                const isDisabled = repo.alreadyLaunched;
                const hasDraft = !!repo.draftProjectId;
                const handleClick = () => {
                  if (isDisabled) return;
                  if (hasDraft && repo.draftProjectId) {
                    router.push(`/launch?draftId=${repo.draftProjectId}`);
                    return;
                  }
                  onSelect(repo);
                };
                return (
                  <li key={repo.id}>
                    <button
                      type="button"
                      onClick={handleClick}
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      aria-disabled={isDisabled}
                      aria-label={
                        hasDraft
                          ? `Continue draft for ${repo.fullName}`
                          : undefined
                      }
                      className={cn(
                        "gb-control grid w-full grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 text-left transition-[background-color,border-color,box-shadow,color,transform]",
                        !isDisabled && "gb-control-ghost hover:text-fg",
                        isSelected &&
                          "gb-control-secondary bg-surface-elevated text-fg",
                        isDisabled && "opacity-50",
                      )}
                    >
                      <Image
                        src={repo.ownerAvatarUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 shrink-0 rounded-full bg-surface"
                      />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-body-md text-fg">
                            {repo.fullName}
                          </span>
                          {repo.alreadyLaunched ? (
                            <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-label-sm text-warning">
                              Already launched
                            </span>
                          ) : hasDraft ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-label-sm text-info">
                              Continue draft
                              <ArrowRight className="size-3" aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        {repo.description ? (
                          <p className="mt-0.5 line-clamp-2 text-body-sm text-fg-secondary">
                            {repo.description}
                          </p>
                        ) : null}
                        <div className="mt-1 flex items-center gap-4 text-caption text-fg-muted">
                          {repo.language ? <span>{repo.language}</span> : null}
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3" />
                            <span className="text-mono-sm">
                              {repo.stargazersCount}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GitFork className="size-3" />
                            <span className="text-mono-sm">
                              {repo.forksCount}
                            </span>
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function friendlyError(
  status: number,
  code: string | undefined,
  message: string | undefined,
): string {
  if (status === 401) {
    return (
      message ?? "You're not signed in with GitHub. Sign in to list your repos."
    );
  }
  if (status === 503) {
    return message ?? "GitHub OAuth isn't configured on this environment yet.";
  }
  if (status === 429) {
    return "You're loading repos too fast. Wait a minute and try again.";
  }
  if (code === "github_error") {
    return message ?? "GitHub returned an error. Check your token scopes.";
  }
  return message ?? `GitHub list-repos failed (HTTP ${status}).`;
}
