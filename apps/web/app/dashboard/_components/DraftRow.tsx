"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { discardDraftAction } from "@/app/(public)/launch/actions";
import { StatusBadge } from "./ProjectList";

export interface DraftRowProps {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  status: "draft";
  createdAt: Date;
}

/**
 * Single row in the Drafts card on /dashboard/projects.
 *
 * Owner-only operations: continue (link to wizard) + discard. Discard frees
 * the (ghOwner, ghRepo) UNIQUE slot so the user can pick a different repo.
 */
export function DraftRow({ row }: { row: DraftRowProps }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDiscard() {
    if (
      !window.confirm(
        `Discard draft for ${row.slug}? This frees the repo slot so a different draft can take it.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    startTransition(async () => {
      const result = await discardDraftAction(row.id);
      setPending(false);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(`Draft for ${row.slug} discarded`);
      router.refresh();
    });
  }

  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-6 py-3 transition-colors hover:bg-surface-elevated/40">
      <Avatar src={row.imageUrl} alt={row.slug} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-label-md text-fg">{row.name}</span>
          <StatusBadge status={row.status} />
        </div>
        <div className="text-mono-sm text-fg-muted truncate">{row.slug}</div>
        {error ? (
          <div className="mt-1 text-caption text-danger">{error}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="primary" size="sm">
          <Link href={`/launch?draftId=${row.id}`}>
            <Pencil className="size-3.5" />
            Continue
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDiscard}
          disabled={pending}
          aria-label={`Discard draft ${row.slug}`}
        >
          <Trash2 className="size-3.5" />
          {pending ? "Discarding…" : "Discard"}
        </Button>
      </div>
    </li>
  );
}

function Avatar({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <span className="grid size-10 place-items-center rounded-full bg-surface-elevated text-label-sm text-fg-muted">
        {alt.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={40}
      height={40}
      sizes="40px"
      className="size-10 rounded-full border border-border object-cover"
    />
  );
}
