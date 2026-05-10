import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Sparkles, Wallet } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import { getMyLinkedWallets } from "@/lib/queries/dashboard";
import { formatAddress, formatRelativeTime } from "@repo/lib";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { CopyButton } from "@/components/shared";
import { solscanAddressUrl } from "@/lib/solana/explorer";

export default function WalletsPage() {
  return (
    <Suspense fallback={null}>
      <WalletsPageContent />
    </Suspense>
  );
}

async function WalletsPageContent() {
  if (!hasCredentials.db()) {
    return (
      <div className="mx-auto w-full max-w-content">
        <EmptyState
          icon={Sparkles}
          title="Stub mode"
          description="Set DATABASE_URL or POSTGRES_URL to view linked wallets."
        />
      </div>
    );
  }

  const session = await requireAuthSession("/dashboard/wallets");
  const wallets = await getMyLinkedWallets(session.user.id);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <div className="flex justify-end">
        <Button asChild variant="primary">
          <Link href="/auth/wallet">
            <Plus className="size-4" /> Link a wallet
          </Link>
        </Button>
      </div>

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>
            {wallets.length} linked wallet{wallets.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Your primary wallet receives payouts by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {wallets.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState
                icon={Wallet}
                title="No wallets linked"
                description="Link a Solana wallet for launch signing and account attestations. Contributor fee claims happen in Bags."
                cta={{ label: "Link a wallet", href: "/auth/wallet" }}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {wallets.map((w) => (
                <li
                  key={w.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-6 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-mono-md text-fg">
                        {formatAddress(w.address, 6, 6)}
                      </span>
                      <CopyButton value={w.address} label="Copy address" />
                      <Link
                        href={solscanAddressUrl(w.address)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-fg-muted hover:text-fg"
                        aria-label="Solscan"
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                    {w.label ? (
                      <div className="text-caption text-fg-muted">
                        {w.label}
                      </div>
                    ) : null}
                  </div>
                  <Badge variant="default" size="sm">
                    {w.chain}
                  </Badge>
                  {w.isPrimary ? (
                    <Badge variant="primary" size="sm">
                      primary
                    </Badge>
                  ) : (
                    <span className="text-caption text-fg-muted">—</span>
                  )}
                  <span className="inline-flex items-center gap-2">
                    <Badge variant="success" size="sm" dot dotColor="success">
                      verified
                    </Badge>
                    <span className="text-caption text-fg-muted">
                      {formatRelativeTime(w.verifiedAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
