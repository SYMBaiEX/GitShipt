import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

export default function ProjectNotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-bg p-4 outline-none"
    >
      <EmptyState
        heading="h1"
        icon={SearchX}
        title="Project not found"
        description="We couldn't find that GitHub repository on GitShipt."
        cta={{ label: "Browse projects", href: "/explore" }}
        secondary={{ label: "Go home", href: "/" }}
      />
    </main>
  );
}
