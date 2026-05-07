import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Octokit } from "@octokit/rest";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { dbHttp, dbPool } from "@/db";
import { accounts, projects, projectMemberships, users } from "@/db/schema";
import { check } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { validateClientKey, withIdempotency } from "@/lib/idempotency";
import { hasCredentials, stubsAllowed } from "@/lib/env";
import { revalidatePublicCaches, revalidateUserCaches } from "@/lib/cache";
import {
  CreateProjectBodySchema,
  CreateProjectResponseSchema,
} from "@repo/shared";
import { applyDbRlsContext } from "@/lib/db-rls";
import { isProjectsGhRepoUniqueViolation } from "@/lib/db-errors";

/**
 * POST /api/projects — create a draft project.
 *
 * Steps:
 *   1. Rate limit (project-create: 30/hour/user, fall back to IP).
 *   2. Authenticate via better-auth.
 *   3. Verify the requester is an admin of the GitHub repo via Octokit
 *      user-context. Skipped in stub mode (no GitHub credentials).
 *   4. Insert project row + project_memberships row in a single transaction.
 *   5. Append `project.create` audit entry.
 *   6. Wrap the whole mutation in withIdempotency().
 *
 * Returns `{ projectId, status: 'draft' }`.
 */
export async function POST(req: Request): Promise<Response> {
  if (!hasCredentials.db()) {
    return NextResponse.json(
      { error: "db_unavailable", message: "DB not configured." },
      { status: 503 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent");

  // Session check first so the rate-limit key is the userId (not IP).
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = await check("project-create", `project-create:${userId}`);
  if (!limit.success) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Project-create limit reached (30/hour). Try again later.",
      },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateProjectBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Repo-admin re-verification — never trust the client's claim.
  if (hasCredentials.github()) {
    const verifyResult = await verifyRepoAdmin({
      userId,
      ghOwner: body.ghOwner,
      ghRepo: body.ghRepo,
    });
    if (!verifyResult.ok) {
      return NextResponse.json(
        { error: verifyResult.code, message: verifyResult.message },
        { status: verifyResult.status },
      );
    }
  } else if (!stubsAllowed()) {
    return NextResponse.json(
      {
        error: "github_credentials_required",
        message: "GitHub credentials are required to verify repo ownership.",
      },
      { status: 503 },
    );
  }

  // Make sure the user row actually exists (better-auth normally creates
  // it on first sign-in, but we defend against drift).
  const dbp = dbPool();
  const userExists = await dbHttp
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userExists.length === 0) {
    return NextResponse.json(
      { error: "user_missing", message: "Auth user not found in DB." },
      { status: 401 },
    );
  }

  const rawIdempotencyKey = req.headers.get("idempotency-key");
  if (!rawIdempotencyKey) {
    return NextResponse.json(
      { error: "idempotency_key_required" },
      { status: 400 },
    );
  }
  let idempotencyKey: string;
  try {
    idempotencyKey = validateClientKey(rawIdempotencyKey);
  } catch {
    return NextResponse.json(
      { error: "idempotency_key_format" },
      { status: 400 },
    );
  }

  try {
    const result = await withIdempotency(
      idempotencyKey,
      async () => {
        const { projectId } = await dbp.transaction(async (tx) => {
          await applyDbRlsContext(tx);
          const [inserted] = await tx
            .insert(projects)
            .values({
              ownerUserId: userId,
              ghOwner: body.ghOwner,
              ghRepo: body.ghRepo,
              ghRepoId: body.ghRepoId,
              ghInstallationId: body.ghInstallationId ?? null,
              name: body.name,
              symbol: body.symbol,
              description: body.description ?? null,
              imageUrl: body.imageUrl,
              tokenWebsiteUrl: body.website ?? null,
              tokenTwitterUrl: body.twitter ?? null,
              tokenTelegramUrl: body.telegram ?? null,
              status: "draft",
              platformFeeBps: body.platformFeeBps,
              scoringConfig: body.scoringConfig,
              payoutConfig: body.payoutConfig,
            })
            .returning({ id: projects.id });

          if (!inserted) {
            throw new Error("Failed to insert project row.");
          }

          await tx.insert(projectMemberships).values({
            userId,
            projectId: inserted.id,
            role: "project_owner",
          });

          return { projectId: inserted.id };
        });

        await audit({
          actorUserId: userId,
          action: "project.create",
          targetType: "project",
          targetId: projectId,
          metadata: {
            ghOwner: body.ghOwner,
            ghRepo: body.ghRepo,
            ghRepoId: body.ghRepoId,
            symbol: body.symbol,
            website: body.website,
            twitter: body.twitter,
            telegram: body.telegram,
            platformFeeBps: body.platformFeeBps,
          },
          ip,
          userAgent,
        });

        return CreateProjectResponseSchema.parse({
          projectId,
          status: "draft" as const,
        });
      },
      { scope: `project:create:${userId}` },
    );

    revalidatePublicCaches();
    revalidateUserCaches(userId);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    // Most likely cause: ghRepoUq violation = repo already launched.
    const message =
      e instanceof Error ? e.message : "Failed to create project.";
    if (isProjectsGhRepoUniqueViolation(e)) {
      return NextResponse.json(
        {
          error: "already_exists",
          message: `${body.ghOwner}/${body.ghRepo} is already launched.`,
        },
        { status: 409 },
      );
    }
    console.error("[projects:create] failed:", e);
    return NextResponse.json(
      { error: "create_failed", message },
      { status: 500 },
    );
  }
}

interface VerifyRepoOk {
  ok: true;
}
interface VerifyRepoErr {
  ok: false;
  code: string;
  message: string;
  status: number;
}

async function verifyRepoAdmin(args: {
  userId: string;
  ghOwner: string;
  ghRepo: string;
}): Promise<VerifyRepoOk | VerifyRepoErr> {
  const [account] = await dbHttp
    .select({ accessToken: accounts.accessToken })
    .from(accounts)
    .where(
      and(eq(accounts.userId, args.userId), eq(accounts.providerId, "github")),
    )
    .limit(1);

  if (!account?.accessToken) {
    return {
      ok: false,
      code: "no_github_token",
      message: "GitHub OAuth token missing — sign out and sign back in.",
      status: 401,
    };
  }

  const octokit = new Octokit({ auth: account.accessToken });
  try {
    const { data } = await octokit.repos.get({
      owner: args.ghOwner,
      repo: args.ghRepo,
    });
    if (data.permissions?.admin !== true) {
      return {
        ok: false,
        code: "not_admin",
        message: "You must be a repo admin to launch a token.",
        status: 403,
      };
    }
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "GitHub repo lookup failed.";
    return {
      ok: false,
      code: "github_error",
      message,
      status: 502,
    };
  }
}
