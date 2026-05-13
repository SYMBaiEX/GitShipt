import { Connection, type Commitment } from "@solana/web3.js";
import { serverEnv, hasCredentials } from "@/lib/env";

// Cache keyed by (url, commitment) so a caller asking for a different
// commitment doesn't silently get the first-call's commitment. Also
// keyed by URL so a Helius rotation takes effect on the next call.
const _cache = new Map<string, Connection>();

/**
 * Solana RPC connection. Uses Helius (env: HELIUS_RPC_URL) for
 * production reads and `https://api.devnet.solana.com` as a no-creds
 * fallback for local dev. Cluster is set on the URL itself; we don't
 * track it separately.
 *
 * Cached per (url, commitment) tuple so multiple callsites with
 * different commitment requirements (processed/confirmed/finalized)
 * each get a correctly-configured connection.
 */
export function solanaConnection(
  commitment: Commitment = "processed",
): Connection {
  const env = serverEnv();
  const url = env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
  const key = `${url}::${commitment}`;
  const existing = _cache.get(key);
  if (existing) return existing;
  const conn = new Connection(url, { commitment });
  _cache.set(key, conn);
  return conn;
}

export function hasSolanaConnection(): boolean {
  return hasCredentials.solana();
}

/**
 * Retry an RPC call with exponential backoff for transient errors.
 * Only retries on network / 5xx / rate-limit errors — not on
 * deterministic ones like blockhash-expired or instruction failure.
 */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientRpcError(e) || attempt === maxAttempts) throw e;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function isTransientRpcError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    /\b5\d\d\b/.test(msg)
  );
}
