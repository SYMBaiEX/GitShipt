"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@repo/ui";
import { Button } from "@repo/ui";
import { cn } from "@repo/lib";

export interface PageErrorProps {
  /** The Error caught by the Next error boundary. */
  error: Error & { digest?: string };
  /** Re-renders the segment. Provided by Next's error.tsx contract. */
  reset: () => void;
  /** Optional override for the headline. Defaults to "Something went wrong". */
  title?: string;
  /** Optional override for the body copy. Falls back to a generic message. */
  description?: React.ReactNode;
  className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/**
 * Centered error UI rendered by every Next `error.tsx` boundary.
 *
 * Visual: AlertTriangle icon → headline-sm title → body-md description →
 * primary "Try again" (wires `reset()`) + secondary "Go home" link.
 * If `error.digest` is present, surfaces it as `text-mono-sm text-fg-muted`
 * for support reference.
 */
export function PageError({
  error,
  reset,
  title = "Something went wrong",
  description,
  className,
}: PageErrorProps) {
  const fallbackDescription =
    "An unexpected error occurred while loading this page. Try again, or head back home if it keeps failing.";

  return (
    <div
      className={cn(
        "flex w-full items-center justify-center px-6 py-12",
        className,
      )}
    >
      <Card
        depth="flat"
        padding="lg"
        className="flex w-full max-w-md flex-col items-center gap-3 text-center"
      >
        <AlertTriangle className="size-16 text-danger" aria-hidden />
        <h1 className="text-headline-sm text-fg">{title}</h1>
        <p className="max-w-md text-body-md text-fg-secondary">
          {description ?? fallbackDescription}
        </p>
        {error.digest ? (
          <p className="text-mono-sm text-fg-muted" aria-label="Error reference">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="default"
            onClick={() => reset()}
            className={FOCUS_RING}
          >
            Try again
          </Button>
          <Button asChild variant="ghost" size="default">
            <Link href="/" className={FOCUS_RING}>
              Go home
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
