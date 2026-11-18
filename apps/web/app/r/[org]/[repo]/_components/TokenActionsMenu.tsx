"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Github,
} from "@repo/ui";
import { ChevronDown, Code2, Copy, ExternalLink } from "lucide-react";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

const subscribeToHydration = () => () => undefined;

export function TokenActionsMenu({
  tokenMint,
  ghOwner,
  ghRepo,
  className,
}: {
  tokenMint: string | null;
  ghOwner: string;
  ghRepo: string;
  className?: string;
}) {
  // The HTML can reach the browser before Radix's keyboard handlers are ready.
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
    } catch {
      toast.error(
        "Clipboard access was denied. Check your browser permissions.",
      );
    }
  }

  function copyEmbed() {
    const path = [ghOwner, ghRepo].map(encodeURIComponent).join("/");
    const src = new URL(`/embed/r/${path}`, window.location.origin).href;
    void copy(
      `<iframe src="${src}" width="380" height="360" style="border:0;border-radius:8px;color-scheme:light dark" loading="lazy" title="GitShipt token widget"></iframe>`,
      "Embed code copied.",
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={!ready}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={className}
        >
          Share <ChevronDown aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={12}>
        <DropdownMenuItem onSelect={copyEmbed}>
          <Code2 aria-hidden /> Copy embed code
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!tokenMint}
          onSelect={() => {
            if (tokenMint) void copy(tokenMint, "Token address copied.");
          }}
        >
          <Copy aria-hidden /> Copy token address
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href={`https://github.com/${ghOwner}/${ghRepo}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Github aria-hidden /> GitHub repository{" "}
            <ExternalLink aria-hidden className="ml-auto" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
