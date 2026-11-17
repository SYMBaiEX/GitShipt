import { Frown } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

/**
 * Generic 404 — rendered when no route matches and no closer not-found.tsx
 * is provided.
 */
export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-bg p-4 outline-none"
    >
      <EmptyState
        heading="h1"
        icon={Frown}
        title="Page not found"
        description="This page doesn't exist or may have been moved."
        cta={{ label: "Go home", href: "/" }}
        secondary={{ label: "Browse projects", href: "/explore" }}
      />
    </main>
  );
}
