import "server-only";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export type RlsContext =
  | { mode: "anon"; reason?: string }
  | { mode: "user"; userId: string; role: string; reason?: string }
  | { mode: "service"; reason: string };

// Async-context propagation works one of two ways depending on the caller:
//
//   1. Concurrent user requests (auth, route handlers, server actions) need
//      AsyncLocalStorage so simultaneous requests in a Fluid Compute instance
//      don't leak each other's RLS context. Those entries import
//      `@/db/rls-storage-init` at module load (see below) which stashes a
//      real `AsyncLocalStorage` instance under `STORE_KEY` on globalThis.
//      `getRlsContext` reads from that storage when present.
//
//   2. Standalone workflow bundles without a Node storage initializer
//      use the lightweight `_override`
//      mechanism (settable via `enterDbServiceContext` / `enterDbWorkflowContext`
//      in `@/lib/db-rls`) so they never have to import `node:async_hooks`.
//      The Workflow DevKit's build analyzer rejects any reachable static
//      `node:async_hooks` import, so workflow helpers MUST stay on the
//      override path.
//
// Order of resolution in `getRlsContext`: AsyncLocalStorage > override > anon.

const STORE_KEY = Symbol.for("gitshipt.rls-storage");

interface AsyncLocalStorageLike<T> {
  getStore(): T | undefined;
  enterWith(value: T): void;
  run<R>(value: T, fn: () => R): R;
}

function getStorage(): AsyncLocalStorageLike<RlsContext> | null {
  const slot = (
    globalThis as unknown as {
      [k: symbol]: AsyncLocalStorageLike<RlsContext> | undefined;
    }
  )[STORE_KEY];
  return slot ?? null;
}

export function hasRlsStorage(): boolean {
  return getStorage() !== null;
}

let _override: RlsContext | null = null;

export function setRlsOverride(ctx: RlsContext | null): void {
  _override = ctx;
}

export function getRlsOverride(): RlsContext | null {
  return _override;
}

export function getRlsContext(): RlsContext {
  const fromStorage = getStorage()?.getStore();
  if (fromStorage) return fromStorage;
  if (_override) return _override;
  return { mode: "anon" };
}

function requireStorage(): AsyncLocalStorageLike<RlsContext> {
  const s = getStorage();
  if (!s) {
    throw new Error(
      "[rls-context] AsyncLocalStorage is not initialized. Import " +
        '"@/db/rls-storage-init" from your entry point (layout, route ' +
        "handler, or auth setup) before calling enterRlsContext / withRlsContext.",
    );
  }
  return s;
}

export function enterRlsContext(ctx: RlsContext): void {
  requireStorage().enterWith(ctx);
}

export function withRlsContext<T>(
  ctx: RlsContext,
  fn: () => PromiseLike<T>,
): Promise<T> {
  // Drizzle starts query work when its thenable is awaited, not when it is built.
  return requireStorage().run(ctx, async () => await fn());
}

/**
 * Wrap Neon HTTP queries in a short transaction that first sets the local RLS
 * GUCs consumed by Postgres policies. Drizzle still sees only the actual query
 * result. No context defaults to anon, so accidental private reads fail closed.
 *
 * @neondatabase/serverless v1.0 made the function-call form of the query
 * function template-only at the type level; the parameterized `(query, params)`
 * form moved to `.query()` and `sql.query()` inside transactions. Drizzle uses
 * `client.query ?? client`, so exposing `.query()` is what matters here.
 */
const RLS_GUC_QUERY =
  "select set_config('app.rls_mode', $1, true), set_config('app.user_id', $2, true), set_config('app.role', $3, true), set_config('app.rls_reason', $4, true)";

export function createRlsNeonClient(
  base: NeonQueryFunction<false, false>,
): NeonQueryFunction<false, false> {
  const rlsParams = (): [string, string, string, string] => {
    const ctx = getRlsContext();
    return [
      ctx.mode,
      ctx.mode === "user" ? ctx.userId : "",
      ctx.mode === "user" ? ctx.role : "",
      ctx.reason ?? "",
    ];
  };

  // Template-literal pass-through. Drizzle prefers `.query()`, so this path is
  // mostly for ad-hoc `await sql\`...\`` callers — the RLS context is still
  // applied via the wrapped transaction below.
  const wrapped = ((strings: TemplateStringsArray, ...params: unknown[]) =>
    base(strings, ...params)) as NeonQueryFunction<false, false>;

  wrapped.query = ((query: string, params?: unknown[], opts?: unknown) => {
    const promise = base
      .transaction(
        (sql) => [sql.query(RLS_GUC_QUERY, rlsParams()), sql.query(query, params)],
        opts as Parameters<typeof base.transaction>[1],
      )
      .then((results) => results[1]);

    Object.assign(promise, {
      parameterizedQuery: { query, params: params ?? [] },
      opts,
    });
    return promise;
  }) as NeonQueryFunction<false, false>["query"];

  wrapped.transaction = ((queriesOrFn, opts) =>
    base.transaction(
      (sql) => [
        sql.query(RLS_GUC_QUERY, rlsParams()),
        ...(typeof queriesOrFn === "function" ? queriesOrFn(sql) : queriesOrFn),
      ],
      opts,
    )) as NeonQueryFunction<false, false>["transaction"];

  wrapped.unsafe = base.unsafe.bind(base);

  return wrapped;
}

export function pgServiceOptions(): string {
  return "-c app.rls_mode=service -c app.rls_reason=pool";
}
