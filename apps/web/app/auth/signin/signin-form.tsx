"use client";

import { Github } from "@repo/ui";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@repo/ui";

export function SignInForm({ next }: { next: string }) {
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGithub() {
    setLoading(true);
    setError(null);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: next,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <main
      id="main-content"
      className="grid min-h-screen place-items-center bg-bg px-6 py-12"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-card-elevated surface-highlight">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-fg">
            <Sparkles className="size-4" />
          </span>
          <span className="text-headline-sm">GitShipt</span>
        </Link>

        <h1 className="text-headline-md">Sign in</h1>
        <p className="mt-2 text-body-md text-fg-secondary">
          Connect your GitHub account. We use your repo access to verify
          ownership when you launch a token.
        </p>

        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={handleGithub}
          disabled={isLoading}
          className="mt-8 w-full"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Redirecting to GitHub…
            </>
          ) : (
            <>
              <Github className="size-4" aria-hidden />
              Continue with GitHub
            </>
          )}
        </Button>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-danger bg-danger-soft px-3 py-2 text-body-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <p className="mt-8 text-caption text-fg-muted">
          By signing in, you agree to the{" "}
          <Link
            href="/legal/terms"
            className="text-fg underline decoration-fg-muted underline-offset-2 transition-colors hover:decoration-fg"
          >
            terms
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/privacy"
            className="text-fg underline decoration-fg-muted underline-offset-2 transition-colors hover:decoration-fg"
          >
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
