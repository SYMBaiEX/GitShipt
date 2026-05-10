import { Github } from "@repo/ui";
import { Coins, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "@repo/ui";

/**
 * Three-step explainer that anchors the bottom of the marketing fold.
 * Floating cards (depth=flat) so the section reads as supporting detail
 * — the Top Projects grid above carries the visual weight.
 */
const STEPS = [
  {
    n: 1,
    title: "Connect a repo",
    Icon: Github,
    body: "Sign in with GitHub, pick the repo you want to fund, set your leaderboard formula.",
  },
  {
    n: 2,
    title: "Launch a Bags token",
    Icon: Sparkles,
    body: "GitShipt mints a Bags.fm token bound to the repo and makes it tradeable on the configured Solana cluster.",
  },
  {
    n: 3,
    title: "Contributors get paid",
    Icon: Coins,
    body: "GitShipt refreshes contributor BPS from the leaderboard. Contributors claim eligible fees directly through Bags.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-headline-md text-fg">How GitShipt works</h2>
        <p className="text-body-md text-fg-secondary">
          Three steps from a public repo to Bags-native fee sharing for the
          people who build it.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map(({ n, title, body, Icon }) => (
          <Card
            key={n}
            depth="flat"
            padding="lg"
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-md bg-surface-elevated text-fg-secondary"
              >
                <Icon className="size-5" />
              </span>
              <span className="text-mono-sm text-fg-muted">Step {n}</span>
            </div>
            <CardContent className="flex flex-col gap-2">
              <CardTitle>{title}</CardTitle>
              <CardDescription className="text-body-md text-fg-secondary">
                {body}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
