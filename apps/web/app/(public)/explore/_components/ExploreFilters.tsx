"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { cn } from "@repo/lib";
import { Input } from "@repo/ui";

type StatusKey = "all" | "live" | "paused" | "tracked";
type SortKey = "trending" | "lifetime" | "contributors" | "newest";

const STATUS_OPTIONS: Array<{ key: StatusKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "paused", label: "Paused" },
  { key: "tracked", label: "Tracked" },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "trending", label: "Trending · 24h fees" },
  { key: "lifetime", label: "Top earners · lifetime" },
  { key: "contributors", label: "Most contributors" },
  { key: "newest", label: "Newest" },
];

/**
 * URL-driven filter bar for /explore. Reads + writes query params (`status`,
 * `sort`, `q`) so filters are deep-linkable + back/forward-able. The page
 * re-renders server-side every time params change — we just navigate.
 *
 * Search input is debounced 300ms so we don't fire a navigation per keystroke.
 */
export function ExploreFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const status = (params.get("status") as StatusKey | null) ?? "all";
  const sort = (params.get("sort") as SortKey | null) ?? "trending";
  const q = params.get("q") ?? "";

  // Local search state (debounced) — keeps the input responsive while
  // we hold off pushing the URL until the user pauses typing.
  const [searchValue, setSearchValue] = useState(q);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSearchValue(q));
    return () => cancelAnimationFrame(raf);
  }, [q]);

  const pushParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `/explore?${qs}` : "/explore", {
          scroll: false,
          transitionTypes: ["filter-results"],
        });
      });
    },
    [params, router],
  );

  useEffect(() => {
    if (searchValue === q) return;
    const t = setTimeout(() => {
      pushParams((p) => {
        if (searchValue) p.set("q", searchValue);
        else p.delete("q");
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchValue, q, pushParams]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface/50 px-3 py-3 md:flex-row md:items-center md:gap-3">
      <Input
        variant="ghost"
        size="default"
        type="search"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder="Repo, owner, or token"
        leadingIcon={<Search className="size-4" />}
        clearable
        onClear={() => setSearchValue("")}
        wrapperClassName="md:max-w-md md:flex-1"
        aria-label="Search projects"
      />

      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        <div
          role="group"
          aria-label="Status filter"
          className="gb-control-cluster inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-bg/40 p-0.5"
        >
          {STATUS_OPTIONS.map(({ key, label }) => {
            const on = status === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={isPending && on}
                onClick={() =>
                  pushParams((p) => {
                    if (key === "all") p.delete("status");
                    else p.set("status", key);
                  })
                }
                className={cn(
                  "rounded border px-3 py-1.5 text-label-sm transition-[background-color,border-color,box-shadow,color,transform]",
                  on
                    ? "gb-control gb-control-secondary border-border-strong bg-surface-elevated text-fg"
                    : "gb-route-link gb-route-link-inactive text-fg-secondary hover:text-fg",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <label className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border/60 bg-bg/40 px-3 text-label-md text-fg focus-within:outline-2 focus-within:outline-focus-ring">
          <span className="text-fg-muted">Sort</span>
          <select
            value={sort}
            disabled={isPending}
            onChange={(e) =>
              pushParams((p) => {
                const nextSort = e.target.value as SortKey;
                if (nextSort === "trending") p.delete("sort");
                else p.set("sort", nextSort);
              })
            }
            className="min-h-11 min-w-0 bg-transparent text-label-md text-fg outline-none lg:min-h-9"
            aria-label="Sort projects"
          >
            {SORT_OPTIONS.map(({ key, label }) => (
              <option key={key} value={key} className="bg-surface text-fg">
                {label}
              </option>
            ))}
          </select>
        </label>
        {isPending ? (
          <span
            role="status"
            aria-live="polite"
            className="text-caption text-fg-muted"
          >
            Updating...
          </span>
        ) : null}
      </div>
    </div>
  );
}
