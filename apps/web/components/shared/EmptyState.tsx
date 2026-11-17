import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@repo/ui";
import { Button } from "@repo/ui";
import { cn } from "@repo/lib";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Primary CTA — rendered as a primary Button wrapping a Next.js Link. */
  cta?: { label: string; href: string };
  /** Optional secondary action — rendered as a ghost Button. */
  secondary?: { label: string; href: string };
  /**
   * When `true`, wraps content in a flat Card surface (border + bg-surface).
   * Default `false`, which renders directly on the page bg — useful for
   * full-page empty states (404 / not-found) where a card would compete.
   */
  bordered?: boolean;
  heading?: "h1" | "h2";
  className?: string;
}

/**
 * Canonical empty state — centered Lucide icon, headline-sm title, body-md
 * description, optional primary + secondary CTAs.
 *
 * Per DESIGN.md "Empty states":
 *   - 64×64 Lucide icon in `fg-muted`
 *   - `headline-sm` title
 *   - `body-md` description in `fg-secondary`, max-w-md, centered
 *   - Primary CTA below
 *   - Never illustrated graphics
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  secondary,
  bordered = false,
  heading: Heading = "h2",
  className,
}: EmptyStateProps) {
  const inner = (
    <>
      <Icon className="size-16 text-fg-muted" aria-hidden />
      <Heading className="text-headline-sm text-fg">{title}</Heading>
      {description ? (
        <p className="max-w-md text-body-md text-fg-secondary">{description}</p>
      ) : null}
      {(cta || secondary) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {cta ? (
            <Button asChild variant="primary" size="default">
              <Link href={cta.href}>{cta.label}</Link>
            </Button>
          ) : null}
          {secondary ? (
            <Button asChild variant="ghost" size="default">
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          ) : null}
        </div>
      )}
    </>
  );

  if (bordered) {
    return (
      <Card
        depth="flat"
        padding="lg"
        className={cn(
          "flex flex-col items-center justify-center gap-3 text-center",
          className,
        )}
      >
        {inner}
      </Card>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      {inner}
    </div>
  );
}
