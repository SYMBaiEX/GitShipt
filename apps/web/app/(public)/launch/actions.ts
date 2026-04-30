"use server";

import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { Octokit } from "@octokit/rest";
import { auth } from "@/lib/auth";
import { dbHttp, dbPool } from "@/db";
import {
  accounts,
  projects,
  projectMemberships,
  users,
  wallets,
} from "@/db/schema";
import { check } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { deriveKey, withIdempotency } from "@/lib/idempotency";
import {
  hasCredentials,
  canLaunchOnBags,
  serverEnv,
  stubsAllowed,
} from "@/lib/env";
import { bags } from "@/lib/bags/client";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { updateProjectCaches, updateUserCaches } from "@/lib/cache-actions";
import {
  CreateProjectBodySchema,
  UpdateDraftBodySchema,
  type CreateProjectBody,
  type UpdateDraftBody,
} from "@repo/shared";
import { applyDbRlsContext } from "@/lib/db-rls";
import { isProjectsGhRepoUniqueViolation } from "@/lib/db-errors";
import { resolveGitHubInstallationForRepo } from "@/lib/github/installations";

/**
 * Server action used by `<ReviewAndSign>` to drive the create + launch flow
 * in a single round-trip. The HTTP routes (POST /api/projects, POST
 * /api/projects/:id/launch) are still the stable public surface — this
 * action just composes them with shared logic.
 */

const PLATFORM_GH_USERNAME = "gitshipt-platform";

export interface LaunchProgressUpdate {
  phase:
    | "creating-draft"
    | "uploading-metadata"
    | "configuring-fee-share"
    | "submitting-tx"
    | "persisting"
    | "done";
}

export interface LaunchActionResult {
  ok: true;
  projectId: string;
  tokenMint: string;
  status: "launch_configured" | "live" | "simulated_live";
  stub: boolean;
  requiresSignature?: boolean;
  transactionBase64?: string;
  launchWalletAddress?: string;
  initialBuyLamports?: number;
  configKey?: string;
  txSig: string | null;
  ghOwner: string;
  ghRepo: string;
  note?: string;
}

export interface LaunchActionError {
  ok: false;
  error: string;
  message: string;
  status: number;
  projectId?: string;
}

/**
 * Create the draft project + immediately launch it via Bags. Single action so
 * the wizard's final-step UX shows progress without two network round-trips.
 *
 * Idempotent on `(userId, ghRepoId)` — calling twice for the same repo
 * returns the existing live token mint.
 */
export async function createAndLaunchAction(
  body: CreateProjectBody,
  idempotencyKey?: string,
): Promise<LaunchActionResult | LaunchActionError> {
  if (!hasCredentials.db()) {
    return {
      ok: false,
      error: "db_unavailable",
      message: "DB not configured.",
      status: 503,
    };
  }

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      ok: false,
      error: "unauthorized",
      message: "Sign in with GitHub to launch.",
      status: 401,
    };
  }
  const userId = session.user.id;

  const limit = await check("project-create", `project-create:${userId}`);
  if (!limit.success) {
    return {
      ok: false,
      error: "rate_limited",
      message: "Project-create limit reached (3/hour).",
      status: 429,
    };
  }

  const parsed = CreateProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_body",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      status: 400,
    };
  }
  const validated = parsed.data;
  const launchWalletAddress = validated.launchWalletAddress?.trim() ?? null;
  const willStubLaunch = !canLaunchOnBags().ok || !hasCredentials.bags();
  if (!willStubLaunch && !launchWalletAddress) {
    return {
      ok: false,
      error: "wallet_required",
      message: "Connect and link a Solana wallet before launching.",
      status: 400,
    };
  }
  if (launchWalletAddress) {
    const linked = await isWalletBoundToUser(userId, launchWalletAddress);
    if (!linked) {
      return {
        ok: false,
        error: "wallet_not_linked",
        message:
          "This wallet is connected but not linked to your GitShipt account. Sign the wallet message first.",
        status: 403,
      };
    }
  }

  // Repo-admin re-verification (skipped in stub mode without GitHub creds).
  if (hasCredentials.github()) {
    const verifyResult = await verifyRepoAdmin({
      userId,
      ghOwner: validated.ghOwner,
      ghRepo: validated.ghRepo,
    });
    if (!verifyResult.ok) {
      return {
        ok: false,
        error: verifyResult.code,
        message: verifyResult.message,
        status: verifyResult.status,
      };
    }
  } else if (!stubsAllowed()) {
    return {
      ok: false,
      error: "github_credentials_required",
      message: "GitHub credentials are required to verify repo ownership.",
      status: 503,
    };
  }

  const dbp = dbPool();
  const userRow = await dbHttp
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRow.length === 0) {
    return {
      ok: false,
      error: "user_missing",
      message: "Auth user not found in DB.",
      status: 401,
    };
  }

  const effectiveKey =
    idempotencyKey ?? `launch:${userId}:${validated.ghRepoId}`;

  try {
    const result = await withIdempotency<LaunchActionResult>(
      effectiveKey,
      async () => {
        // Insert project draft (or recover existing live row keyed on
        // (ghOwner, ghRepo) UNIQUE).
        let projectId: string;
        let isExistingLive = false;

        try {
          const txResult = await dbp.transaction(async (tx) => {
            await applyDbRlsContext(tx);
            const [inserted] = await tx
              .insert(projects)
              .values({
                ownerUserId: userId,
                ghOwner: validated.ghOwner,
                ghRepo: validated.ghRepo,
                ghRepoId: validated.ghRepoId,
                ghInstallationId: validated.ghInstallationId ?? null,
                name: validated.name,
                symbol: validated.symbol,
                description: validated.description ?? null,
                imageUrl: validated.imageUrl,
                tokenWebsiteUrl: validated.website ?? null,
                tokenTwitterUrl: validated.twitter ?? null,
                tokenTelegramUrl: validated.telegram ?? null,
                status: "draft",
                platformFeeBps: validated.platformFeeBps,
                scoringConfig: validated.scoringConfig,
                payoutConfig: validated.payoutConfig,
              })
              .returning({ id: projects.id });

            if (!inserted) {
              throw new Error("Project insert returned no row.");
            }

            await tx.insert(projectMemberships).values({
              userId,
              projectId: inserted.id,
              role: "project_owner",
            });

            return inserted.id;
          });
          projectId = txResult;

          await audit({
            actorUserId: userId,
            action: "project.create",
            targetType: "project",
            targetId: projectId,
            metadata: {
              ghOwner: validated.ghOwner,
              ghRepo: validated.ghRepo,
              ghRepoId: validated.ghRepoId,
              platformFeeBps: validated.platformFeeBps,
            },
          });
        } catch (e) {
          // UNIQUE violation on (ghOwner, ghRepo) → recover an existing project.
          if (isProjectsGhRepoUniqueViolation(e)) {
            const [existing] = await dbHttp
              .select({
                id: projects.id,
                status: projects.status,
                tokenMint: projects.tokenMint,
                bagsConfigKey: projects.bagsConfigKey,
              })
              .from(projects)
              .where(
                and(
                  eq(projects.ghOwner, validated.ghOwner),
                  eq(projects.ghRepo, validated.ghRepo),
                ),
              )
              .limit(1);
            if (!existing) throw e;
            projectId = existing.id;

            // If already launched, short-circuit.
            if (
              (existing.status === "live" ||
                existing.status === "simulated_live") &&
              existing.tokenMint
            ) {
              isExistingLive = true;
              return {
                ok: true,
                projectId,
                tokenMint: existing.tokenMint,
                status: existing.status,
                stub: existing.status === "simulated_live",
                configKey: existing.bagsConfigKey ?? undefined,
                txSig: null,
                ghOwner: validated.ghOwner,
                ghRepo: validated.ghRepo,
                note: "Existing live project — returned cached token mint.",
              } satisfies LaunchActionResult;
            }
          } else {
            throw e;
          }
        }

        if (isExistingLive) {
          // Already returned above.
          throw new Error("Unreachable");
        }

        // Authoritative permission check before launching.
        await requirePermission("project.update", { userId, projectId });

        const [project] = await dbHttp
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        if (!project) {
          throw new ActionError("not_found", "Project not found.", 404);
        }

        if (!willStubLaunch) {
          const installationId = await ensureGitHubInstallation({
            userId,
            projectId,
            ghOwner: validated.ghOwner,
            ghRepo: validated.ghRepo,
            currentInstallationId: project.ghInstallationId,
          });
          if (!installationId) {
            throw new ActionError(
              "github_app_required",
              "Install the GitShipt GitHub App for this repo before the on-chain launch. Save the draft, install the app, then return to launch.",
              409,
              projectId,
            );
          }
          project.ghInstallationId = installationId;
        }

        if (project.status === "launch_configured") {
          const ready = readConfiguredLaunch(project);
          if (!ready.ok) {
            throw new ActionError(
              "launch_config_incomplete",
              ready.message,
              409,
            );
          }

          const guard = canLaunchOnBags();
          if (!guard.ok) {
            throw new ActionError(
              "launch_refused",
              `Refusing on-chain launch: ${guard.reason}`,
              409,
            );
          }
          if (launchWalletAddress !== ready.config.launchWallet) {
            throw new ActionError(
              "launch_wallet_mismatch",
              "The connected wallet no longer matches the prepared launch wallet. Reconnect the wallet shown in the launch manifest.",
              409,
              projectId,
            );
          }
          const prepared = await bags.createLaunchTransactionForWallet({
            tokenMint: ready.config.tokenMint,
            metadataUrl: ready.config.metadataUrl,
            configKey: ready.config.configKey,
            launchWallet: ready.config.launchWallet,
            initialBuyLamports: ready.config.initialBuyLamports,
          });

          return {
            ok: true,
            projectId,
            tokenMint: ready.config.tokenMint,
            status: "launch_configured",
            stub: false,
            configKey: ready.config.configKey,
            txSig: null,
            requiresSignature: true,
            transactionBase64: prepared.transactionBase64,
            launchWalletAddress: ready.config.launchWallet,
            initialBuyLamports: ready.config.initialBuyLamports,
            ghOwner: validated.ghOwner,
            ghRepo: validated.ghRepo,
            note: "Launch transaction prepared. Review it in your wallet to broadcast the token launch.",
          } satisfies LaunchActionResult;
        }

        if (project.status !== "draft") {
          if (project.tokenMint) {
            const statusLabel =
              project.status === "simulated_live" ? "Not Live" : project.status;
            return {
              ok: true,
              projectId,
              tokenMint: project.tokenMint,
              status:
                project.status === "simulated_live" ? "simulated_live" : "live",
              stub: project.status === "simulated_live",
              configKey: project.bagsConfigKey ?? undefined,
              txSig: null,
              ghOwner: validated.ghOwner,
              ghRepo: validated.ghRepo,
              note: `Project status is ${statusLabel}; returning persisted token mint.`,
            } satisfies LaunchActionResult;
          }
          const statusLabel =
            project.status === "simulated_live" ? "Not Live" : project.status;
          throw new ActionError(
            "bad_status",
            `Project is in ${statusLabel} status; cannot launch.`,
            409,
          );
        }

        // Bags step 1: token info
        const tokenInfo = await bags.createTokenInfo({
          name: validated.name,
          symbol: validated.symbol,
          description: validated.description,
          imageUrl: validated.imageUrl,
          website: validated.website,
          twitter: validated.twitter,
          telegram: validated.telegram,
        });
        const isStub = Boolean(tokenInfo.__stub);

        const payoutWallet = payoutSignerPublicKey();
        if (!isStub && !payoutWallet) {
          throw new ActionError(
            "launch_wallet_missing",
            "SOLANA_PAYOUT_KEYPAIR is required before live Bags launch.",
            409,
          );
        }
        const stubPoolWallet = isStub
          ? (await bags.resolveWallet("github", PLATFORM_GH_USERNAME)).wallet
          : null;
        const poolClaimerWallet = payoutWallet ?? stubPoolWallet;
        if (!poolClaimerWallet) {
          throw new ActionError(
            "pool_wallet_missing",
            "Unable to derive the Bags pool claimer wallet.",
            409,
          );
        }
        const payer = poolClaimerWallet;
        const launchWallet = isStub ? payer : launchWalletAddress;
        if (!launchWallet) {
          throw new ActionError(
            "wallet_required",
            "Connect and link a Solana wallet before launching.",
            400,
            projectId,
          );
        }

        // Bags step 2: fee-share config
        const feeShareConfig = await bags.createFeeShareConfig({
          payer,
          baseMint: tokenInfo.tokenMint,
          feeClaimers: [
            {
              wallet: poolClaimerWallet,
              bps: 10_000 - validated.platformFeeBps,
            },
          ],
          platformFeeWallet: serverEnv().SOLANA_TREASURY_ADDRESS,
          shareFee: validated.platformFeeBps,
        });

        const configuredAt = new Date();
        const configuredStatus = isStub
          ? "simulated_live"
          : "launch_configured";
        const initialBuyLamports = serverEnv().BAGS_INITIAL_BUY_LAMPORTS;
        const [configured] = await dbHttp
          .update(projects)
          .set({
            tokenMint: tokenInfo.tokenMint,
            bagsLaunchId: isStub ? feeShareConfig.configKey : null,
            bagsConfigKey: feeShareConfig.configKey,
            bagsLaunchSignature: null,
            bagsLaunchWallet: isStub ? null : launchWallet,
            bagsPoolClaimerWallet: poolClaimerWallet,
            bagsTokenMetadata: tokenInfo.tokenMetadata,
            bagsInitialBuyLamports: initialBuyLamports,
            status: configuredStatus,
            simulatedAt: isStub ? configuredAt : null,
            updatedAt: configuredAt,
          })
          .where(eq(projects.id, projectId))
          .returning({ id: projects.id });

        if (!configured) {
          throw new ActionError(
            "launch_config_persist_failed",
            "Failed to persist Bags launch configuration before final launch.",
            500,
          );
        }

        await audit({
          actorUserId: userId,
          action: "project.launch",
          targetType: "project",
          targetId: projectId,
          metadata: {
            phase: "configured",
            tokenMint: tokenInfo.tokenMint,
            bagsConfigKey: feeShareConfig.configKey,
            stub: isStub,
            platformFeeBps: validated.platformFeeBps,
            feeShareConfigSignatures: feeShareConfig.txSignatures,
            launchWallet: isStub ? null : launchWallet,
            poolClaimerWallet,
            initialBuyLamports,
            cluster: serverEnvCluster(),
          },
        });

        // Bags step 3: create the final launch transaction for the user's
        // linked wallet. The browser wallet signs and broadcasts it; the
        // follow-up complete action persists the on-chain signature.
        const txSig = isStub
          ? (feeShareConfig.txSignatures.at(-1) ?? null)
          : null;
        const launchSignature: string | null = null;
        let note: string | undefined;
        let preparedTransactionBase64: string | undefined;
        if (isStub) {
          note =
            "Stub mode — token mint is fake; no on-chain transaction sent.";
        } else {
          const guard = canLaunchOnBags();
          if (!guard.ok) {
            throw new ActionError(
              "launch_refused",
              `Refusing on-chain launch: ${guard.reason}`,
              409,
            );
          }
          const prepared = await bags.createLaunchTransactionForWallet({
            tokenMint: tokenInfo.tokenMint,
            metadataUrl: tokenInfo.tokenMetadata,
            configKey: feeShareConfig.configKey,
            launchWallet,
            initialBuyLamports,
          });
          preparedTransactionBase64 = prepared.transactionBase64;
          note =
            "Launch transaction prepared. Review it in your wallet to broadcast the token launch.";
        }

        // Persist terminal launch state. Real mode only reaches this point
        // after the Bags launch transaction is broadcast; the configured
        // checkpoint above prevents retries from regenerating token/config.
        const persistNow = new Date();
        const [updated] = await dbHttp
          .update(projects)
          .set({
            tokenMint: tokenInfo.tokenMint,
            bagsLaunchId: isStub ? feeShareConfig.configKey : null,
            bagsConfigKey: feeShareConfig.configKey,
            bagsLaunchSignature: launchSignature,
            bagsLaunchWallet: isStub ? null : launchWallet,
            bagsPoolClaimerWallet: poolClaimerWallet,
            bagsTokenMetadata: tokenInfo.tokenMetadata,
            bagsInitialBuyLamports: initialBuyLamports,
            status: isStub ? "simulated_live" : "launch_configured",
            simulatedAt: isStub ? persistNow : null,
            updatedAt: persistNow,
          })
          .where(eq(projects.id, projectId))
          .returning({ id: projects.id });

        if (!updated) {
          throw new ActionError(
            "update_failed",
            isStub
              ? "Failed to persist simulated launch."
              : "Final Bags launch was submitted, but the live state could not be persisted. Manual review is required before retrying.",
            500,
          );
        }

        await audit({
          actorUserId: userId,
          action: "project.launch_complete",
          targetType: "project",
          targetId: projectId,
          metadata: {
            phase: "complete",
            tokenMint: tokenInfo.tokenMint,
            bagsConfigKey: feeShareConfig.configKey,
            stub: isStub,
            platformFeeBps: validated.platformFeeBps,
            feeShareConfigSignatures: feeShareConfig.txSignatures,
            launchSignature,
            launchWallet: isStub ? null : launchWallet,
            poolClaimerWallet,
            initialBuyLamports,
            cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet",
          },
        });

        // Wake up the env validator so misconfig surfaces here, not on the
        // first cron tick. Kept inside the action so it doesn't bloat the
        // hot path on subsequent calls.
        try {
          serverEnv();
        } catch {
          /* tolerated; non-fatal at this stage */
        }

        return {
          ok: true,
          projectId,
          tokenMint: tokenInfo.tokenMint,
          status: isStub ? "simulated_live" : "launch_configured",
          stub: isStub,
          configKey: feeShareConfig.configKey,
          txSig,
          requiresSignature: !isStub,
          transactionBase64: preparedTransactionBase64,
          launchWalletAddress: isStub ? undefined : launchWallet,
          initialBuyLamports,
          ghOwner: validated.ghOwner,
          ghRepo: validated.ghRepo,
          note,
        } satisfies LaunchActionResult;
      },
      { scope: `launch:${userId}:${validated.ghRepoId}` },
    );

    // Revalidate the now-live public project page.
    revalidatePath(`/r/${result.ghOwner}/${result.ghRepo}`);
    await updateProjectCaches(
      result.projectId,
      `${result.ghOwner}/${result.ghRepo}`,
    );
    return result;
  } catch (e) {
    if (e instanceof ActionError) {
      return {
        ok: false,
        error: e.code,
        message: e.message,
        status: e.status,
        projectId: e.projectId,
      };
    }
    if (e instanceof PermissionError) {
      return {
        ok: false,
        error: "forbidden",
        message: e.message,
        status: 403,
      };
    }
    const message = e instanceof Error ? e.message : "Launch failed.";
    console.error("[launch:action] failed:", e);
    return {
      ok: false,
      error: "launch_failed",
      message,
      status: 500,
    };
  }
}

export async function completeLaunchAction(input: {
  projectId: string;
  signature: string;
  launchWalletAddress: string;
}): Promise<LaunchActionResult | LaunchActionError> {
  if (!hasCredentials.db()) {
    return {
      ok: false,
      error: "db_unavailable",
      message: "DB not configured.",
      status: 503,
    };
  }

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      ok: false,
      error: "unauthorized",
      message: "Sign in with GitHub to finish launch.",
      status: 401,
    };
  }
  const userId = session.user.id;
  const projectId = input.projectId.trim();
  const signature = input.signature.trim();
  const launchWalletAddress = input.launchWalletAddress.trim();

  if (!projectId || !signature || signature.length < 32) {
    return {
      ok: false,
      error: "invalid_signature",
      message: "The wallet did not return a valid launch signature.",
      status: 400,
      projectId,
    };
  }

  try {
    await requirePermission("project.update", { userId, projectId });
    if (!(await isWalletBoundToUser(userId, launchWalletAddress))) {
      throw new ActionError(
        "wallet_not_linked",
        "The launch wallet is not linked to your GitShipt account.",
        403,
        projectId,
      );
    }

    const [project] = await dbHttp
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      throw new ActionError("not_found", "Project not found.", 404, projectId);
    }
    if (project.status === "live" && project.tokenMint) {
      return {
        ok: true,
        projectId,
        tokenMint: project.tokenMint,
        status: "live",
        stub: false,
        configKey: project.bagsConfigKey ?? undefined,
        txSig: project.bagsLaunchSignature ?? signature,
        launchWalletAddress: project.bagsLaunchWallet ?? launchWalletAddress,
        initialBuyLamports: project.bagsInitialBuyLamports,
        ghOwner: project.ghOwner,
        ghRepo: project.ghRepo,
        note: "Launch was already recorded as live.",
      };
    }
    if (project.status !== "launch_configured") {
      throw new ActionError(
        "bad_status",
        `Project is in ${project.status} status; cannot finish launch.`,
        409,
        projectId,
      );
    }

    const ready = readConfiguredLaunch(project);
    if (!ready.ok) {
      throw new ActionError(
        "launch_config_incomplete",
        ready.message,
        409,
        projectId,
      );
    }
    if (ready.config.launchWallet !== launchWalletAddress) {
      throw new ActionError(
        "launch_wallet_mismatch",
        "The signed wallet does not match the prepared launch wallet.",
        409,
        projectId,
      );
    }

    const now = new Date();
    const [updated] = await dbHttp
      .update(projects)
      .set({
        bagsLaunchId: signature,
        bagsLaunchSignature: signature,
        bagsLaunchWallet: launchWalletAddress,
        status: "live",
        simulatedAt: null,
        updatedAt: now,
      })
      .where(eq(projects.id, projectId))
      .returning({
        id: projects.id,
        tokenMint: projects.tokenMint,
        ghOwner: projects.ghOwner,
        ghRepo: projects.ghRepo,
        bagsConfigKey: projects.bagsConfigKey,
      });
    if (!updated?.tokenMint) {
      throw new ActionError(
        "launch_complete_persist_failed",
        "The launch was broadcast, but GitShipt could not persist the live state. Manual review is required before retrying.",
        500,
        projectId,
      );
    }

    await audit({
      actorUserId: userId,
      action: "project.launch_complete",
      targetType: "project",
      targetId: projectId,
      metadata: {
        phase: "complete",
        tokenMint: updated.tokenMint,
        bagsConfigKey: updated.bagsConfigKey,
        launchSignature: signature,
        launchWallet: launchWalletAddress,
        poolClaimerWallet: project.bagsPoolClaimerWallet,
        initialBuyLamports: ready.config.initialBuyLamports,
        cluster: serverEnvCluster(),
      },
    });

    revalidatePath(`/r/${updated.ghOwner}/${updated.ghRepo}`);
    await updateProjectCaches(
      projectId,
      `${updated.ghOwner}/${updated.ghRepo}`,
    );

    return {
      ok: true,
      projectId,
      tokenMint: updated.tokenMint,
      status: "live",
      stub: false,
      configKey: updated.bagsConfigKey ?? undefined,
      txSig: signature,
      launchWalletAddress,
      initialBuyLamports: ready.config.initialBuyLamports,
      ghOwner: updated.ghOwner,
      ghRepo: updated.ghRepo,
      note: "Bags launch transaction broadcast. Token is live.",
    };
  } catch (e) {
    if (e instanceof ActionError) {
      return {
        ok: false,
        error: e.code,
        message: e.message,
        status: e.status,
        projectId: e.projectId,
      };
    }
    if (e instanceof PermissionError) {
      return {
        ok: false,
        error: "forbidden",
        message: e.message,
        status: 403,
        projectId,
      };
    }
    const message =
      e instanceof Error ? e.message : "Launch completion failed.";
    console.error("[launch:complete] failed:", e);
    return {
      ok: false,
      error: "launch_complete_failed",
      message,
      status: 500,
      projectId,
    };
  }
}

class ActionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly projectId?: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

interface VerifyOk {
  ok: true;
}
interface VerifyErr {
  ok: false;
  code: string;
  message: string;
  status: number;
}

async function verifyRepoAdmin(args: {
  userId: string;
  ghOwner: string;
  ghRepo: string;
}): Promise<VerifyOk | VerifyErr> {
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
      message: "GitHub OAuth token missing — sign out and back in.",
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
        message: "You must be a repo admin to launch.",
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

async function isWalletBoundToUser(
  userId: string,
  walletAddress: string,
): Promise<boolean> {
  const [row] = await dbHttp
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.address, walletAddress)))
    .limit(1);
  return Boolean(row);
}

async function ensureGitHubInstallation(args: {
  userId: string;
  projectId: string;
  ghOwner: string;
  ghRepo: string;
  currentInstallationId: string | null;
}): Promise<string | null> {
  if (args.currentInstallationId) return args.currentInstallationId;
  if (!hasCredentials.githubApp()) return null;

  const resolved = await resolveGitHubInstallationForRepo({
    owner: args.ghOwner,
    repo: args.ghRepo,
  });
  if (!resolved) return null;

  await dbHttp
    .update(projects)
    .set({
      ghInstallationId: resolved.installationId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, args.projectId));

  await audit({
    actorUserId: args.userId,
    action: "project.gh_app_install",
    targetType: "project",
    targetId: args.projectId,
    metadata: {
      installationId: resolved.installationId,
      setupAction: "existing",
      resolvedFromExistingInstall: true,
      source: "launch-readiness",
    },
  });

  return resolved.installationId;
}

// ============================================================
// Save-draft action — wizard "Save draft" button
// ============================================================

export interface SaveDraftResult {
  ok: true;
  projectId: string;
  status: "draft";
  created: boolean;
}

export interface SaveDraftError {
  ok: false;
  error: string;
  message: string;
  status: number;
}

/**
 * Persist the wizard's current state as a draft project. Idempotent on
 * `(userId, ghRepoId)` — if a draft already exists for this repo we update it
 * in place; otherwise we create a new one.
 *
 * Never touches Bags. Drafts can be resumed via /launch?draftId=... and
 * launched later via the existing createAndLaunchAction.
 *
 * Caller passes `existingProjectId` if the wizard is editing a known draft;
 * if omitted we look up by (ghOwner, ghRepo) and update the row when found.
 */
export async function saveDraftAction(
  body: CreateProjectBody,
  existingProjectId?: string,
  idempotencyKey?: string,
): Promise<SaveDraftResult | SaveDraftError> {
  if (!hasCredentials.db()) {
    return {
      ok: false,
      error: "db_unavailable",
      message: "DB not configured.",
      status: 503,
    };
  }

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      ok: false,
      error: "unauthorized",
      message: "Sign in with GitHub to save a draft.",
      status: 401,
    };
  }
  const userId = session.user.id;

  const limit = await check("default", `draft-save:${userId}`);
  if (!limit.success) {
    return {
      ok: false,
      error: "rate_limited",
      message: "Save-draft limit reached. Try again in a minute.",
      status: 429,
    };
  }

  const parsed = CreateProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_body",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      status: 400,
    };
  }
  const validated = parsed.data;

  // Repo-admin re-verification — never trust the client's claim, even on save.
  if (hasCredentials.github()) {
    const verifyResult = await verifyRepoAdmin({
      userId,
      ghOwner: validated.ghOwner,
      ghRepo: validated.ghRepo,
    });
    if (!verifyResult.ok) {
      return {
        ok: false,
        error: verifyResult.code,
        message: verifyResult.message,
        status: verifyResult.status,
      };
    }
  } else if (!stubsAllowed()) {
    return {
      ok: false,
      error: "github_credentials_required",
      message: "GitHub credentials are required to verify repo ownership.",
      status: 503,
    };
  }

  const userRow = await dbHttp
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRow.length === 0) {
    return {
      ok: false,
      error: "user_missing",
      message: "Auth user not found in DB.",
      status: 401,
    };
  }

  const effectiveKey =
    idempotencyKey ??
    deriveKey(
      "draft-save",
      userId,
      existingProjectId ?? `${validated.ghOwner}/${validated.ghRepo}`,
      draftContentHash(validated),
    );

  try {
    const result = await withIdempotency<SaveDraftResult>(
      effectiveKey,
      async () => {
        // Look up an existing draft. Priority: (a) explicit id passed in,
        // (b) (ghOwner, ghRepo) UNIQUE match owned by this user.
        let existing: {
          id: string;
          status: string;
          ownerUserId: string;
        } | null = null;
        if (existingProjectId) {
          const [row] = await dbHttp
            .select({
              id: projects.id,
              status: projects.status,
              ownerUserId: projects.ownerUserId,
            })
            .from(projects)
            .where(eq(projects.id, existingProjectId))
            .limit(1);
          existing = row ?? null;
          if (!existing) {
            throw new ActionError(
              "not_found",
              "Draft not found. It may have been discarded.",
              404,
            );
          }
        } else {
          const [row] = await dbHttp
            .select({
              id: projects.id,
              status: projects.status,
              ownerUserId: projects.ownerUserId,
            })
            .from(projects)
            .where(
              and(
                eq(projects.ghOwner, validated.ghOwner),
                eq(projects.ghRepo, validated.ghRepo),
              ),
            )
            .limit(1);
          existing = row ?? null;
        }

        // ---- UPDATE path ---------------------------------------------------
        if (existing) {
          if (existing.ownerUserId !== userId) {
            throw new ActionError(
              "forbidden",
              "You don't own this draft.",
              403,
            );
          }
          if (existing.status !== "draft") {
            throw new ActionError(
              "not_draft",
              "This project is already launched. Edit it from the project console.",
              409,
            );
          }
          await requirePermission("project.update", {
            userId,
            projectId: existing.id,
          });

          const updates: UpdateDraftBody = {
            name: validated.name,
            symbol: validated.symbol,
            description: validated.description,
            imageUrl: validated.imageUrl,
            website: validated.website ?? "",
            twitter: validated.twitter ?? "",
            telegram: validated.telegram ?? "",
            scoringConfig: validated.scoringConfig,
            payoutConfig: validated.payoutConfig,
            platformFeeBps: validated.platformFeeBps,
          };
          // Sanity check the partial through the same Zod schema the PATCH uses.
          UpdateDraftBodySchema.parse(updates);

          await dbHttp
            .update(projects)
            .set({
              name: updates.name!,
              symbol: updates.symbol!,
              description: updates.description!,
              imageUrl: updates.imageUrl!,
              tokenWebsiteUrl: updates.website ? updates.website : null,
              tokenTwitterUrl: updates.twitter ? updates.twitter : null,
              tokenTelegramUrl: updates.telegram ? updates.telegram : null,
              scoringConfig: updates.scoringConfig!,
              payoutConfig: updates.payoutConfig!,
              platformFeeBps: updates.platformFeeBps!,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, existing.id));

          await audit({
            actorUserId: userId,
            action: "project.update",
            targetType: "project",
            targetId: existing.id,
            metadata: { phase: "draft", source: "wizard_save" },
          });

          return {
            ok: true,
            projectId: existing.id,
            status: "draft",
            created: false,
          };
        }

        // ---- CREATE path ---------------------------------------------------
        const dbp = dbPool();
        const inserted = await dbp.transaction(async (tx) => {
          await applyDbRlsContext(tx);
          const [row] = await tx
            .insert(projects)
            .values({
              ownerUserId: userId,
              ghOwner: validated.ghOwner,
              ghRepo: validated.ghRepo,
              ghRepoId: validated.ghRepoId,
              ghInstallationId: validated.ghInstallationId ?? null,
              name: validated.name,
              symbol: validated.symbol,
              description: validated.description ?? null,
              imageUrl: validated.imageUrl,
              tokenWebsiteUrl: validated.website ?? null,
              tokenTwitterUrl: validated.twitter ?? null,
              tokenTelegramUrl: validated.telegram ?? null,
              status: "draft",
              platformFeeBps: validated.platformFeeBps,
              scoringConfig: validated.scoringConfig,
              payoutConfig: validated.payoutConfig,
            })
            .returning({ id: projects.id });
          if (!row) throw new Error("Failed to insert draft.");
          await tx.insert(projectMemberships).values({
            userId,
            projectId: row.id,
            role: "project_owner",
          });
          return row;
        });

        await audit({
          actorUserId: userId,
          action: "project.create",
          targetType: "project",
          targetId: inserted.id,
          metadata: {
            phase: "draft",
            source: "wizard_save",
            ghOwner: validated.ghOwner,
            ghRepo: validated.ghRepo,
            ghRepoId: validated.ghRepoId,
          },
        });

        return {
          ok: true,
          projectId: inserted.id,
          status: "draft",
          created: true,
        };
      },
      { scope: `draft:save:${userId}` },
    );

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/projects");
    revalidatePath("/launch");
    await updateUserCaches(userId);
    await updateProjectCaches(
      result.projectId,
      `${validated.ghOwner}/${validated.ghRepo}`,
    );

    return result;
  } catch (e) {
    if (e instanceof ActionError) {
      return { ok: false, error: e.code, message: e.message, status: e.status };
    }
    if (e instanceof PermissionError) {
      return {
        ok: false,
        error: "forbidden",
        message: e.message,
        status: 403,
      };
    }
    const message = e instanceof Error ? e.message : "Failed to save draft.";
    if (isProjectsGhRepoUniqueViolation(e)) {
      return {
        ok: false,
        error: "already_exists",
        message: `${validated.ghOwner}/${validated.ghRepo} is already a project.`,
        status: 409,
      };
    }
    console.error("[draft:save] failed:", e);
    return {
      ok: false,
      error: "save_failed",
      message,
      status: 500,
    };
  }
}

/**
 * Discard a draft project. Frees the (ghOwner, ghRepo) UNIQUE slot. Owner-
 * only. Same guarantees as DELETE /api/projects/[id] — drafts only.
 */
export async function discardDraftAction(
  projectId: string,
  idempotencyKey?: string,
): Promise<{ ok: true } | SaveDraftError> {
  if (!hasCredentials.db()) {
    return {
      ok: false,
      error: "db_unavailable",
      message: "DB not configured.",
      status: 503,
    };
  }
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      ok: false,
      error: "unauthorized",
      message: "Sign in to discard a draft.",
      status: 401,
    };
  }
  const userId = session.user.id;

  let discardedSlug: string | null = null;
  try {
    const discardResult = await withIdempotency<{ ok: true; slug: string }>(
      idempotencyKey ?? deriveKey("draft-discard", userId, projectId),
      async () => {
        const [project] = await dbHttp
          .select({
            id: projects.id,
            status: projects.status,
            ownerUserId: projects.ownerUserId,
            ghOwner: projects.ghOwner,
            ghRepo: projects.ghRepo,
          })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        if (!project) {
          throw new ActionError("not_found", "Draft not found.", 404);
        }
        if (project.status !== "draft") {
          throw new ActionError(
            "not_draft",
            "Only drafts can be discarded.",
            409,
          );
        }
        await requirePermission("project.delete", { userId, projectId });

        await dbHttp.delete(projects).where(eq(projects.id, projectId));
        await audit({
          actorUserId: userId,
          action: "project.delete",
          targetType: "project",
          targetId: projectId,
          metadata: {
            phase: "draft",
            ghOwner: project.ghOwner,
            ghRepo: project.ghRepo,
          },
        });
        discardedSlug = `${project.ghOwner}/${project.ghRepo}`;
        return { ok: true, slug: discardedSlug };
      },
      { scope: `draft:discard:${userId}` },
    );
    discardedSlug = discardResult.slug;
  } catch (e) {
    if (e instanceof ActionError) {
      return { ok: false, error: e.code, message: e.message, status: e.status };
    }
    if (e instanceof PermissionError) {
      return {
        ok: false,
        error: "forbidden",
        message: e.message,
        status: 403,
      };
    }
    throw e;
  }

  if (discardedSlug) revalidatePath(`/r/${discardedSlug}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/projects");
  revalidatePath("/launch");
  await updateUserCaches(userId);
  await updateProjectCaches(projectId, discardedSlug ?? undefined);
  return { ok: true };
}

function draftContentHash(body: CreateProjectBody): string {
  return createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 24);
}

interface ConfiguredLaunch {
  tokenMint: string;
  metadataUrl: string;
  configKey: string;
  launchWallet: string;
  initialBuyLamports: number;
}

function readConfiguredLaunch(
  project: typeof projects.$inferSelect,
): { ok: true; config: ConfiguredLaunch } | { ok: false; message: string } {
  const payoutWallet = payoutSignerPublicKey();
  const launchWallet = project.bagsLaunchWallet ?? payoutWallet;
  if (!project.tokenMint) {
    return {
      ok: false,
      message: "Stored Bags launch configuration is missing token mint.",
    };
  }
  if (!project.bagsConfigKey) {
    return {
      ok: false,
      message: "Stored Bags launch configuration is missing config key.",
    };
  }
  if (!project.bagsTokenMetadata) {
    return {
      ok: false,
      message: "Stored Bags launch configuration is missing metadata URL.",
    };
  }
  if (!launchWallet) {
    return {
      ok: false,
      message: "Stored Bags launch configuration is missing launch wallet.",
    };
  }
  return {
    ok: true,
    config: {
      tokenMint: project.tokenMint,
      metadataUrl: project.bagsTokenMetadata,
      configKey: project.bagsConfigKey,
      launchWallet,
      initialBuyLamports:
        project.bagsInitialBuyLamports ?? serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
    },
  };
}

function serverEnvCluster(): string {
  try {
    serverEnv();
  } catch {
    // keep audit metadata best-effort even when env validation is noisy
  }
  return process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
}

/**
 * Read-only helper used by `<RepoPicker>` server component or any other
 * place that wants to know if the user is signed in. Cheap; no rate limit.
 */
export async function getAuthedUserOrNull(): Promise<{
  id: string;
  name: string | null;
  email: string;
  image: string | null;
} | null> {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email,
    image: session.user.image ?? null,
  };
}
