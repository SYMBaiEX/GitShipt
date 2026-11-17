"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { Search } from "lucide-react";
import { cn } from "@repo/lib";
import { Input } from "@repo/ui";

type Mode = "contributor" | "project";

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "contributor", label: "By contributor" },
  { value: "project", label: "By project" },
];

export function LeaderboardFilters({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const q = params.get("q") ?? "";
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
        router.replace(qs ? `/leaderboard?${qs}` : "/leaderboard", {
          scroll: false,
        });
      });
    },
    [params, router],
  );

  useEffect(() => {
    if (searchValue === q) return;
    const t = setTimeout(() => {
      pushParams((p) => {
        const trimmed = searchValue.trim();
        if (trimmed) p.set("q", trimmed);
        else p.delete("q");
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchValue, q, pushParams]);

  const links = useMemo(() => {
    return MODE_OPTIONS.map(({ value, label }) => {
      const next = new URLSearchParams(params.toString());
      if (value === "contributor") next.delete("mode");
      else next.set("mode", value);
      const qs = next.toString();
      return { value, label, href: qs ? `/leaderboard?${qs}` : "/leaderboard" };
    });
  }, [params]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface/50 px-3 py-3 md:flex-row md:items-center md:gap-3">
      <Input
        variant="ghost"
        size="default"
        type="search"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder={
          mode === "contributor"
            ? "Search contributors or projects..."
            : "Search projects or owners..."
        }
        leadingIcon={<Search className="size-4" />}
        clearable
        onClear={() => setSearchValue("")}
        wrapperClassName="md:max-w-md md:flex-1"
        aria-label="Search leaderboard"
      />

      <div className="flex flex-wrap items-center gap-2 md:ml-auto">
        <nav
          aria-label="Leaderboard view"
          className="gb-control-cluster inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-bg/40 p-0.5"
        >
          {links.map(({ value, label, href }) => {
            const on = mode === value;
            return (
              <Link
                key={value}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-label-md transition-[background-color,border-color,box-shadow,color,transform]",
                  on
                    ? "gb-control gb-control-secondary border-border-strong bg-surface-elevated text-fg"
                    : "gb-route-link gb-route-link-inactive text-fg-secondary hover:text-fg",
                  isPending && on ? "pointer-events-none opacity-80" : null,
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
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
