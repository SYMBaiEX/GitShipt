import Link from "next/link";
import { CheckCircle2, ExternalLink, Sparkles, TriangleAlert } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { DEXSCREENER_PRICE_USDC } from "@repo/shared";

import { DexscreenerOrderDialog } from "./DexscreenerOrderDialog";
import type { DexscreenerOrderSummary } from "@/lib/queries/dexscreener-orders";

interface Props {
  projectId: string;
  tokenMint: string | null;
  order: DexscreenerOrderSummary | null;
}

export function DexscreenerUpsellCard({ projectId, tokenMint, order }: Props) {
  return (
    <Card depth="flat" padding="none">
      <CardHeader className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary-readable" /> DexScreener page
            </CardTitle>
            <CardDescription>
              Add logo, header image, description, and social links to the
              token&apos;s public DexScreener listing.
            </CardDescription>
          </div>
          <StatusBadge order={order} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-6 py-5">
        {!tokenMint ? (
          <p className="text-body-sm text-fg-secondary">
            No token launched yet. Once your project is live the upgrade
            becomes available.
          </p>
        ) : order && (order.status === "paid" || order.status === "stub_paid") ? (
          <PaidState tokenMint={tokenMint} order={order} />
        ) : order && order.status === "failed" ? (
          <FailedState
            tokenMint={tokenMint}
            projectId={projectId}
            error={order.errorMessage}
          />
        ) : order && (order.status === "pending" || order.status === "broadcast") ? (
          <PendingState order={order} />
        ) : (
          <UnclaimedState projectId={projectId} tokenMint={tokenMint} />
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ order }: { order: DexscreenerOrderSummary | null }) {
  if (!order) return null;
  if (order.status === "paid" || order.status === "stub_paid") {
    return (
      <Badge variant="success" size="sm" dot>
        {order.stub ? "Stub upgraded" : "Upgraded"}
      </Badge>
    );
  }
  if (order.status === "pending" || order.status === "broadcast") {
    return (
      <Badge variant="warning" size="sm">
        In progress
      </Badge>
    );
  }
  if (order.status === "failed") {
    return (
      <Badge variant="danger" size="sm">
        Failed
      </Badge>
    );
  }
  return null;
}

function UnclaimedState({
  projectId,
  tokenMint,
}: {
  projectId: string;
  tokenMint: string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-surface-elevated/40 px-3 py-2.5 text-body-sm">
        <div className="flex items-center justify-between">
          <span className="text-fg-secondary">Price</span>
          <span className="text-mono-md text-fg">
            ${DEXSCREENER_PRICE_USDC} USDC or SOL equivalent
          </span>
        </div>
        <p className="mt-1 text-caption text-fg-muted">
          Bags collects the payment. GitShipt does not take a cut.
        </p>
      </div>
      <DexscreenerOrderDialog
        projectId={projectId}
        tokenMint={tokenMint}
        trigger={
          <Button variant="primary">
            <Sparkles className="size-4" /> Upgrade page
          </Button>
        }
      />
    </div>
  );
}

function PaidState({
  tokenMint,
  order,
}: {
  tokenMint: string;
  order: DexscreenerOrderSummary;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-body-sm text-success">
        <CheckCircle2 className="size-4" aria-hidden />
        <span>
          {order.stub
            ? "Stub upgrade recorded (test mode — no on-chain payment)."
            : "Your DexScreener page is upgraded."}
        </span>
      </div>
      <Button asChild variant="secondary">
        <Link
          href={`https://dexscreener.com/solana/${tokenMint}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          View on DexScreener <ExternalLink className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function PendingState({ order }: { order: DexscreenerOrderSummary }) {
  return (
    <div className="space-y-2">
      <p className="text-body-sm text-fg-secondary">
        Payment is in flight. We&apos;ll mark this card as upgraded once Bags
        confirms the on-chain payment. If this state persists for more than
        a few minutes, contact support with order id{" "}
        <span className="text-mono-sm text-fg">{order.orderUuid}</span>.
      </p>
    </div>
  );
}

function FailedState({
  projectId,
  tokenMint,
  error,
}: {
  projectId: string;
  tokenMint: string;
  error: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-body-sm text-danger">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {error ?? "The previous order failed."} You can start a new order.
        </span>
      </div>
      <DexscreenerOrderDialog
        projectId={projectId}
        tokenMint={tokenMint}
        trigger={<Button variant="secondary">Retry order</Button>}
      />
    </div>
  );
}
