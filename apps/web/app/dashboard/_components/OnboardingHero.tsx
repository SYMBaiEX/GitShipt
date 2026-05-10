import * as React from "react";
import Link from "next/link";
import { GitBranch, Trophy, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@repo/ui";
import { Button } from "@repo/ui";

interface Step {
  n: number;
  icon: LucideIcon;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    icon: GitBranch,
    title: "Connect a repo",
    desc: "Pick a GitHub repository you own or co-administer.",
  },
  {
    n: 2,
    icon: Trophy,
    title: "Configure your leaderboard",
    desc: "Choose merit signals and tier weights — defaults cover most teams.",
  },
  {
    n: 3,
    icon: Rocket,
    title: "Launch a token",
    desc: "Mint via Bags.fm and let GitShipt keep contributor BPS aligned with the leaderboard.",
  },
];

/**
 * First-run onboarding hero shown on `/dashboard` when the user owns no
 * projects. A 3-step Card grid (collapses to a single column on mobile)
 * followed by a single primary CTA that points at the launch wizard.
 *
 * Server-component-safe — no client hooks.
 */
export function OnboardingHero() {
  return (
    <div className="flex flex-col items-stretch gap-6 px-2 py-8 sm:px-6 sm:py-10">
      <div className="text-center">
        <h2 className="text-headline-md text-fg">Get started in 3 steps</h2>
        <p className="mx-auto mt-1 max-w-xl text-body-md text-fg-secondary">
          GitShipt routes trading fees to your repo&rsquo;s top contributors
          through Bags-native fee sharing. Here&rsquo;s how to launch your first
          token.
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.n} className="contents">
              <Card
                depth="raised"
                padding="lg"
                className="flex h-full flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="grid size-8 place-items-center rounded-full border border-border-strong bg-surface-elevated text-mono-sm text-fg"
                    aria-hidden
                  >
                    {step.n}
                  </span>
                  <Icon className="size-5 text-fg-muted" aria-hidden />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-label-lg text-fg">{step.title}</h3>
                  <p className="text-body-sm text-fg-secondary">{step.desc}</p>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="flex justify-center">
        <Button asChild variant="primary" size="lg">
          <Link href="/launch">Launch your first token</Link>
        </Button>
      </div>
    </div>
  );
}
