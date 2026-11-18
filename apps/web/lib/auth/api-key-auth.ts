import "server-only";
import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/queries/api-keys";
import type { ApiKeyRow } from "@/db/schema";
import type { ProjectApiKeyScope } from "@repo/shared";
import { withDbServiceContext } from "@/lib/db-rls";
import "@/db/rls-storage-init";

type StoredApiKeyScope = ProjectApiKeyScope | "read" | "*";

export function readPresentedApiKey(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  const xApiKey = req.headers.get("x-api-key");
  return xApiKey?.trim() || null;
}

export async function verifyProjectApiKey(
  req: Request,
  projectId: string,
  requiredScope: ProjectApiKeyScope = "read:project",
): Promise<
  { ok: true; apiKey: ApiKeyRow } | { ok: false; response: NextResponse }
> {
  const presentedKey = readPresentedApiKey(req);
  if (!presentedKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "api_key_required" },
        { status: 401 },
      ),
    };
  }

  const apiKey = await withDbServiceContext("api-key:verify", () =>
    verifyApiKey(presentedKey),
  );
  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "invalid_api_key" },
        { status: 401 },
      ),
    };
  }

  if (apiKey.projectId !== projectId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "api_key_wrong_project" },
        { status: 403 },
      ),
    };
  }

  const scopes = (apiKey.scopes ?? []) as StoredApiKeyScope[];
  const legacyReadAllowed =
    scopes.includes("read") && requiredScope.startsWith("read:");
  if (
    !scopes.includes("*") &&
    !scopes.includes(requiredScope) &&
    !legacyReadAllowed
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "api_key_scope_denied" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, apiKey };
}
