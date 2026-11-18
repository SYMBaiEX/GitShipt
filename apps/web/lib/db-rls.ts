import "server-only";
import { sql, type SQL } from "drizzle-orm";
import {
  getRlsContext,
  getRlsOverride,
  hasRlsStorage,
  setRlsOverride,
  enterRlsContext,
  withRlsContext,
  type RlsContext,
} from "@/db/rls-context";

export { withRlsContext };

// HTTP entry points initialize storage. Only workflow bundles without it
// use the fallback; their build excludes the AsyncLocalStorage initializer.
export function enterDbServiceContext(reason: string): void {
  if (hasRlsStorage()) enterRlsContext({ mode: "service", reason });
  else setRlsOverride({ mode: "service", reason });
}

export function enterDbWorkflowContext(workflowName: string): void {
  enterDbServiceContext(`workflow:${workflowName}`);
}

export async function withDbServiceContext<T>(
  reason: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (hasRlsStorage()) return withRlsContext({ mode: "service", reason }, fn);
  const prev = getRlsOverride();
  setRlsOverride({ mode: "service", reason });
  try {
    return await fn();
  } finally {
    setRlsOverride(prev);
  }
}

export function withUserDb<T>(
  userId: string,
  reason: string,
  fn: () => PromiseLike<T>,
  role = "user",
): Promise<T> {
  return withRlsContext({ mode: "user", userId, role, reason }, fn);
}

interface RlsExecutable {
  execute(query: SQL): Promise<unknown>;
}

export async function applyDbRlsContext(
  tx: RlsExecutable,
  override?: RlsContext,
): Promise<void> {
  const ctx = override ?? getRlsContext();
  const userId = ctx.mode === "user" ? ctx.userId : "";
  const role = ctx.mode === "user" ? ctx.role : "";
  const reason = ctx.reason ?? "";
  await tx.execute(sql`
    select
      set_config('app.rls_mode', ${ctx.mode}, true),
      set_config('app.user_id', ${userId}, true),
      set_config('app.role', ${role}, true),
      set_config('app.rls_reason', ${reason}, true)
  `);
}
