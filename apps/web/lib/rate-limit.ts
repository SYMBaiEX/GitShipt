import { randomUUID } from "node:crypto";
import { redis } from "@/lib/redis";
import { serverEnv } from "@/lib/env";

type LimiterKind =
  | "auth"
  | "siws-verify"
  | "project-create"
  | "project-mutate"
  | "force-snapshot"
  | "trade-quote"
  | "trade-swap"
  | "claim"
  | "api-key"
  | "admin-mutate"
  | "csp-report"
  | "default";

const SLIDING: Record<LimiterKind, { limit: number; windowSeconds: number }> = {
  auth: { limit: 5, windowSeconds: 60 },
  "siws-verify": { limit: 10, windowSeconds: 60 },
  "project-create": { limit: 30, windowSeconds: 60 * 60 },
  // Per-user mutations on owned projects: launch, transfer, reindex, etc.
  "project-mutate": { limit: 12, windowSeconds: 60 },
  "force-snapshot": { limit: 1, windowSeconds: 60 * 60 },
  "trade-quote": { limit: 20, windowSeconds: 60 },
  "trade-swap": { limit: 6, windowSeconds: 60 },
  // Money-flow endpoints. Tight.
  claim: { limit: 6, windowSeconds: 60 },
  // API-key minting / revocation per project owner.
  "api-key": { limit: 10, windowSeconds: 60 * 60 },
  // Admin destructive actions (promote-from-stub, refresh-contributors).
  "admin-mutate": { limit: 30, windowSeconds: 60 },
  // CSP reports: forgive bursts (page load fans out) but cap by IP so a
  // hostile origin cannot spam the observability sink.
  "csp-report": { limit: 30, windowSeconds: 60 },
  default: { limit: 60, windowSeconds: 60 },
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Sliding-window rate limiter via Redis sorted set. Atomic via pipeline:
 *   1. Drop entries older than (now - window).
 *   2. Add current request.
 *   3. Count remaining in window.
 *   4. Refresh expiry so the key gets cleaned up if the user goes idle.
 *
 * Local dev without REDIS_URL is allowed to proceed. Production fails closed
 * so auth, SIWS, and money-moving mutation limits cannot silently disappear.
 */
export async function check(
  kind: LimiterKind,
  identifier: string,
): Promise<RateLimitResult> {
  const r = redis();
  const cfg = SLIDING[kind];
  if (!r) {
    if (serverEnv().NODE_ENV === "production") {
      return { success: false, limit: cfg.limit, remaining: 0, reset: 0 };
    }
    return { success: true, limit: cfg.limit, remaining: cfg.limit, reset: 0 };
  }

  const key = `gitshipt:rl:${kind}:${identifier}`;
  const now = Date.now();
  const windowMs = cfg.windowSeconds * 1000;
  const windowStart = now - windowMs;
  const member = `${now}-${randomUUID()}`;

  const pipe = r.pipeline();
  pipe.zremrangebyscore(key, 0, windowStart);
  pipe.zadd(key, now, member);
  pipe.zcard(key);
  pipe.pexpire(key, windowMs);

  const result = await pipe.exec();
  if (!result) {
    const failClosed = serverEnv().NODE_ENV === "production";
    return {
      success: !failClosed,
      limit: cfg.limit,
      remaining: failClosed ? 0 : cfg.limit,
      reset: now + windowMs,
    };
  }

  // result[2] is the [error, count] tuple from ZCARD
  const zcard = result[2];
  if (!zcard || zcard[0]) {
    const failClosed = serverEnv().NODE_ENV === "production";
    return {
      success: !failClosed,
      limit: cfg.limit,
      remaining: failClosed ? 0 : cfg.limit,
      reset: now + windowMs,
    };
  }
  const count = Number(zcard[1] ?? 0);

  return {
    success: count <= cfg.limit,
    limit: cfg.limit,
    remaining: Math.max(0, cfg.limit - count),
    reset: now + windowMs,
  };
}
