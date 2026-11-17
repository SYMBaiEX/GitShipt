import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, Coins } from "lucide-react";
import { formatSol } from "@repo/lib";
import { rewardModeOf } from "@repo/shared";
import { Badge, Button, Card } from "@repo/ui";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { EmptyState } from "@/components/shared/EmptyState";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { bags } from "@/lib/bags/client";
import { hasCredentials } from "@/lib/env";
import { getOwnedProjectPayoutHistory } from "@/lib/queries/dashboard";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { loadProjectFor } from "../../../_components/loadProject";

export const metadata = { title: "Payouts" };

type Props = { params: Promise<{ id: string }> };

export default function PayoutsPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PayoutsContent params={params} />
    </Suspense>
  );
}

async function PayoutsContent({ params }: Props) {
  if (!hasCredentials.db()) {
    return <EmptyState icon={Coins} title="Payouts unavailable" heading="h1" />;
  }

  const { id } = await params;
  const { project, userId } = await loadProjectFor(id, "payouts.read");
  const ownerRewards = rewardModeOf(project.payoutConfig) === "owner";
  const hasLiveMint =
    !!project.tokenMint && ["live", "paused", "killed"].includes(project.status);
  const history = !ownerRewards && project.tokenMint
    ? await getOwnedProjectPayoutHistory(id, userId)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${id}` },
          { label: "Payouts" },
        ]}
      />
      <h1 className="text-headline-lg">Payouts</h1>
      {ownerRewards && hasLiveMint && project.tokenMint ? (
        <Card depth="flat" className="flex flex-col items-start gap-3">
          <h2 className="text-headline-sm">Owner rewards</h2>
          <p className="text-body-md text-fg-secondary">
            Bags handles rewards for the linked launch wallet. Contributor rankings do not determine payouts.
          </p>
          <Button asChild variant="secondary">
            <Link href={bags.bagsTokenUrl(project.tokenMint)} target="_blank" rel="noreferrer noopener">
              View on Bags.fm <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </Card>
      ) : history.length ? (
        <Card depth="flat" padding="none">
          <h2 className="border-b border-border px-4 py-3 text-headline-sm">
            Recent payouts
          </h2>
          <ul className="divide-y divide-border">
            {history.map((payout) => (
              <li key={payout.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Badge
                  size="sm"
                  variant={payout.status === "failed" ? "danger" : "default"}
                  className="capitalize"
                >
                  {payout.status}
                </Badge>
                <span className="text-mono-sm">{formatSol(payout.totalLamports, 4)}</span>
                <span className="text-mono-sm text-fg-secondary">{payout.recipientCount} recipients</span>
                {payout.executedAt ? (
                  <span className="text-mono-sm text-fg-secondary">
                    <RelativeTime date={payout.executedAt} />
                  </span>
                ) : null}
                {payout.claimSignature ? (
                  <Link
                    href={solscanTxUrl(payout.claimSignature)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-9 items-center gap-1 text-label-sm text-primary-readable underline"
                  >
                    View claim <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={Coins}
          title="No payouts yet"
          description={hasLiveMint ? "There are no payout records for this project." : "No token has launched for this repository."}
          bordered
        />
      )}
    </div>
  );
}
