import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { verifySiws, SiwsMessageSchema } from "@/lib/auth/siws";
import { auth } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { dbHttp } from "@/db";
import { users, wallets } from "@/db/schema";
import { check } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { hasCredentials, serverEnv, clientEnv } from "@/lib/env";
import { validateClientKey, withIdempotency } from "@/lib/idempotency";
import { getMfaConfirmedAt } from "@/lib/auth/mfa";
import { headers } from "next/headers";
import { WalletVerifyResponseSchema } from "@repo/shared";
import { revalidateLinkedWallets } from "@/lib/cache";
import { withRlsContext } from "@/lib/db-rls";

const MFA_WALLET_LINK_WINDOW_MS = 5 * 60_000;

const BodySchema = z.object({
  message: SiwsMessageSchema,
  signature: z.string().min(64),
});

/**
 * SIWS verify endpoint. Flow:
 *   1. Rate limit by IP.
 *   2. Read current better-auth session (must be signed in via GitHub first).
 *   3. Verify signature against the SIWS message.
 *   4. UPSERT wallet row keyed on (userId, address).
 *   5. Audit log entry.
 *
 * Returns 503 when DB is not configured (stub mode).
 */
export async function POST(req: Request): Promise<Response> {
  if (!hasCredentials.db()) {
    return NextResponse.json(
      { error: "auth_unavailable", message: "DB not configured." },
      { status: 503 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await check("siws-verify", `verify:${ip}`);
  if (!limit.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Session check (auth must already exist via GitHub OAuth).
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  try {
    await requirePermission("account.update", { userId });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  return withRlsContext(
    { mode: "user", userId, role: "user", reason: "wallet:verify" },
    () => verifyAndLinkWallet(req, parsed.data, userId, ip),
  );
}

async function verifyAndLinkWallet(
  req: Request,
  body: z.infer<typeof BodySchema>,
  userId: string,
  ip: string,
): Promise<Response> {
  const env = serverEnv();
  const expectedDomain = new URL(
    env.BETTER_AUTH_URL ?? clientEnv().NEXT_PUBLIC_APP_URL,
  ).host;
  const expectedChainId = `solana:${clientEnv().NEXT_PUBLIC_SOLANA_CLUSTER}`;

  const result = await verifySiws({
    message: body.message,
    signatureBase58: body.signature,
    expectedDomain,
    expectedChainId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "verify_failed", reason: result.reason },
      { status: 400 },
    );
  }

  // MFA freshness gate — if the user has MFA enrolled, require a recent
  // TOTP confirmation before binding a new wallet. Wallet linking grants
  // long-lived signing authority over future SIWS sessions, so reusing a
  // stolen GitHub session cookie to swap in an attacker wallet is the
  // shortest privilege-escalation path. A user who has not enrolled MFA is
  // allowed to proceed with the SIWS+session gate alone.
  const [userRow] = await dbHttp
    .select({ id: users.id, mfaSecretEnc: users.mfaSecretEnc })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const hasMfaEnrolled = Boolean(userRow.mfaSecretEnc);
  if (hasMfaEnrolled) {
    const confirmedAtMs = await getMfaConfirmedAt(userId);
    if (
      confirmedAtMs == null ||
      Date.now() - confirmedAtMs >= MFA_WALLET_LINK_WINDOW_MS
    ) {
      await audit({
        actorUserId: userId,
        action: "auth.wallet_link",
        targetType: "wallet",
        targetId: result.address!,
        metadata: {
          chain: "solana",
          method: "siws",
          phase: "rejected_mfa_required",
        },
        ip,
        userAgent: req.headers.get("user-agent"),
      });
      return NextResponse.json(
        {
          error: "mfa_required",
          message:
            "Re-confirm MFA before linking a wallet. Enter a fresh TOTP code and retry.",
        },
        { status: 401 },
      );
    }
  }

  const rawIdempotencyKey = req.headers.get("idempotency-key");
  let idempotencyKey: string | null = null;
  if (rawIdempotencyKey) {
    try {
      idempotencyKey = validateClientKey(rawIdempotencyKey);
    } catch {
      return NextResponse.json(
        { error: "idempotency_key_format" },
        { status: 400 },
      );
    }
  }

  const persisted = await withIdempotency(
    idempotencyKey,
    async () => {
      await dbHttp
        .insert(wallets)
        .values({
          userId,
          address: result.address!,
          chain: "solana",
          verifiedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [wallets.userId, wallets.address],
        });

      await audit({
        actorUserId: userId,
        action: "auth.wallet_link",
        targetType: "wallet",
        targetId: result.address!,
        metadata: { chain: "solana", method: "siws" },
        ip,
        userAgent: req.headers.get("user-agent"),
      });

      return WalletVerifyResponseSchema.parse({
        ok: true,
        address: result.address,
      });
    },
    { scope: `wallet:verify:${userId}` },
  );

  revalidateLinkedWallets(userId);

  return NextResponse.json(persisted);
}
