import { timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";
import { enterDbServiceContext } from "@/lib/db-rls";
import "@/db/rls-storage-init";

/**
 * Vercel Cron sets `Authorization: Bearer ${CRON_SECRET}` on every cron
 * invocation. Every /api/cron/* handler MUST validate this before running
 * any side-effects.
 *
 * Comparison uses crypto.timingSafeEqual after a length check so that a
 * caller cannot recover the secret byte-by-byte through response-time
 * variance. Anything `===` on a secret is a side-channel.
 *
 * Returns true when the request is authorized to run cron work, false
 * otherwise.
 */
export function isAuthorizedCron(req: Request): boolean {
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    // In dev without CRON_SECRET set, allow on a same-origin request only.
    if (env.NODE_ENV !== "production") {
      const origin = req.headers.get("origin");
      const host = req.headers.get("host");
      if (!origin || origin.includes(host ?? "")) {
        enterDbServiceContext("cron:development");
        return true;
      }
    }
    return false;
  }
  const provided = req.headers.get("authorization");
  if (!provided) return false;
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (provided.length !== expected.length) return false;
  let ok: boolean;
  try {
    ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
  if (ok) enterDbServiceContext("cron");
  return ok;
}
