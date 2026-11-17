import "server-only";
import { NextResponse } from "next/server";
import { start } from "workflow/api";

type WorkflowFnRef = () => Promise<unknown>;

/**
 * Wrap `workflow/api`'s `start()` so a missing/disabled Vercel Workflows
 * setup does NOT 500 every cron invocation (which floods logs and burns
 * the Vercel error budget every minute thanks to /api/cron/health and
 * /api/cron/publish-kpis being scheduled `* * * * *`).
 *
 * On success: returns 200 with `{ ok: true, runId }`.
 * On failure: logs the error, returns 200 with
 * `{ ok: false, error: "workflow_unavailable", message }`. Crons should
 * be no-ops in this state — better that than red dashboards while
 * Workflows is being provisioned.
 *
 * All current crons invoke zero-arg workflows (`start(workflow, [])`).
 * `args` is accepted for symmetry with the call sites and forwarded as-is.
 */
export async function safeStartWorkflow(
  workflow: WorkflowFnRef,
  args: unknown[],
  cronName: string,
): Promise<Response> {
  try {
    // Vercel's `start` overloads are typed strictly per workflow signature;
    // the zero-arg overload is the only one our crons hit. Cast through
    // unknown to satisfy the public surface without leaking generics into
    // the helper's API.
    const run = await (
      start as unknown as (
        wf: WorkflowFnRef,
        a: unknown[],
      ) => Promise<{ runId: string }>
    )(workflow, args);
    return NextResponse.json({ ok: true, runId: run.runId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error(
      `[cron:${cronName}] start() failed (workflow not available?):`,
      message,
    );
    return NextResponse.json(
      {
        ok: false,
        error: "workflow_unavailable",
        message,
      },
      { status: 200 },
    );
  }
}
