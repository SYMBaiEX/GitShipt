import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getAuthSession } from "@/lib/auth/session";
import { SignInWithSolanaFlow } from "@/components/wallet/SignInWithSolanaFlow";
import { SolanaWalletProvider } from "@/components/providers/SolanaWalletProvider";

export const metadata = { title: "Link wallet" };

/**
 * SIWS link page (server component).
 *
 * Auth gate: a GitHub-OAuth session is required first — the wallet is bound
 * to that session via /api/wallets/verify. Unauthenticated users are sent to
 * /auth/signin with `next` set so they bounce back here after sign-in.
 */
export default function WalletAuthPage() {
  return (
    <Suspense fallback={null}>
      <WalletAuthPageContent />
    </Suspense>
  );
}

async function WalletAuthPageContent() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/auth/signin?next=/auth/wallet");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-app-gradient px-6 py-12">
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

        <h1 className="text-headline-md">Link your wallet</h1>
        <p className="mt-2 text-body-md text-fg-secondary">
          Sign a Sign-In-With-Solana (SIWS) message to prove ownership of your
          wallet. We use this for launch signing, account attestations, and
          wallet-aware admin flows. Signing is free; no SOL is spent.
        </p>

        <div className="mt-8">
          <SolanaWalletProvider>
            <SignInWithSolanaFlow />
          </SolanaWalletProvider>
        </div>

        <p className="mt-8 text-caption text-fg-muted">
          Need help? Phantom, Backpack, and Solflare are all supported via the
          Solana wallet standard.
        </p>
      </div>
    </div>
  );
}
