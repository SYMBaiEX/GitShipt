import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { hasCredentials } from "@/lib/env";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _req: Request,
  ctx: RouteContext,
): Promise<Response> {
  if (!hasCredentials.db()) {
    return NextResponse.json(
      { error: "db_unavailable", message: "DB not configured." },
      { status: 503 },
    );
  }

  const { id: projectId } = await ctx.params;
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    await requirePermission("project.update", { userId, projectId });
  } catch (e) {
    if (e instanceof PermissionError) {
      return NextResponse.json(
        { error: "forbidden", message: e.message },
        { status: 403 },
      );
    }
    throw e;
  }

  return NextResponse.json(
    {
      error: "incorporation_unavailable",
      message:
        "Bags does not currently expose incorporation through its public API.",
    },
    { status: 503 },
  );
}
