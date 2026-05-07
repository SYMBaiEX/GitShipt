"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { dbHttp, dbPool } from "@/db";
import {
  projects,
  projectMemberships,
  users,
  platformConfig,
  snapshots,
  type PayoutConfig,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deriveKey, withIdempotency } from "@/lib/idempotency";
import { requirePermission } from "@/lib/auth/permissions";
import {
  destructiveAction,
  DestructiveActionError,
  PendingAdminActionError,
} from "@/lib/auth/destructive-action";
import type {
  AdminActionResult,
  PendingAdminApproval,
} from "@/lib/admin-action-result";
import {
  canLaunchOnBags,
  hasCredentials,
  serverEnv,
  stubsAllowed,
} from "@/lib/env";
import {
  updateAdminCaches,
  updateProjectCaches,
  updateUserCaches,
} from "@/lib/cache-actions";
import { bags } from "@/lib/bags/client";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import { applyDbRlsContext } from "@/lib/db-rls";
import {
  executePartnerFeeClaimAttempt,
  reservePartnerFeeClaimAttempt,
} from "@/lib/funds/partner-fee-claims";
import {
  CreateProjectBodySchema,
  PayoutConfigSchema,
  ScoringConfigSchema,
} from "@repo/shared";
import { healthPulse } from "@/workflows/healthPulse";
import { indexGithubDeltas } from "@/workflows/indexGithubDeltas";
import { takeSnapshot, takeProjectSnapshot } from "@/workflows/takeSnapshot";
import { rebalanceBps } from "@/workflows/rebalanceBps";
import { publishKpis } from "@/workflows/publishKpis";
import { computeLeaderboard as computeLeaderboardWorkflow } from "@/workflows/computeLeaderboard";
import {
  type AdminWorkflowName,
  workflowRetriggerPermission,
} from "./workflow-permissions";

/**
 * Server actions for the super-admin console.
 *
 * Each action:
 *  - Re-validates the session.
 *  - Calls `requirePermission` with the narrowest scope.
 *  - Validates inputs with Zod.
 *  - Wraps destructive ops in `destructiveAction`, idempotent ones in
 *    `withIdempotency`.
 *  - Returns `{ ok: true, ... }` or throws.
 */

async function requireSession(): Promise<{
  userId: string;
  ip: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (!session?.user) throw new Error("unauthenticated");
  return {
    userId: session.user.id,
    ip: h.get("x-forwarded-for") ?? null,
    userAgent: h.get("user-agent") ?? null,
  };
}

const DestructiveBaseSchema = z.object({
  reason: z.string().min(20),
  typedConfirmation: z.string().min(1),
  mfaConfirmedAtMs: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(8).optional(),
  pendingActionId: z.string().min(1).optional(),
});

function irreversibleCosign(input: {
  pendingActionId?: string;
  idempotencyKey: string;
}): {
  required: true;
  pendingActionId?: string;
  idempotencyKey: string;
} {
  return {
    required: true,
    pendingActionId: input.pendingActionId,
    idempotencyKey: input.idempotencyKey,
  };
}

async function runDestructiveAction<T extends { ok: true }>(
  fn: () => Promise<T>,
): Promise<T | PendingAdminApproval> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PendingAdminActionError) {
      return {
        ok: false,
        status: "pending_admin_approval",
        pendingActionId: error.pendingActionId,
        expiresAt: error.expiresAt.toISOString(),
        message: "Second super_admin approval required.",
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Project lifecycle
// ---------------------------------------------------------------------------

const DirectLaunchSchema = CreateProjectBodySchema.extend({
  idempotencyKey: z.string().min(8).optional(),
});

const LAUNCH_SUBMISSION_PENDING_PREFIX = "pending:";

export async function directLaunchProject(input: unknown): Promise<{
  ok: true;
  projectId: string;
  tokenMint: string;
  status: "live" | "simulated_live";
  txSig: string | null;
  note?: string;
}> {
  if (!hasCredentials.db()) throw new Error("db_unavailable");
  const parsed = DirectLaunchSchema.parse(input);
  const ctx = await requireSession();

  await requirePermission("admin.direct_launch", { userId: ctx.userId });

  const willStubMode = !canLaunchOnBags().ok || !hasCredentials.bags();
  if (willStubMode && !stubsAllowed()) {
    throw new Error("live_credentials_required");
  }

  const result = await withIdempotency(
    parsed.idempotencyKey ??
      deriveKey("admin-direct-launch", ctx.userId, parsed.ghRepoId),
    async () => {
      const dbp = dbPool();
      const [existing] = await dbHttp
        .select({
          id: projects.id,
          ownerUserId: projects.ownerUserId,
          status: projects.status,
          tokenMint: projects.tokenMint,
          ghOwner: projects.ghOwner,
          ghRepo: projects.ghRepo,
          bagsConfigKey: projects.bagsConfigKey,
          bagsLaunchSignature: projects.bagsLaunchSignature,
          bagsLaunchWallet: projects.bagsLaunchWallet,
          bagsPoolClaimerWallet: projects.bagsPoolClaimerWallet,
          bagsTokenMetadata: projects.bagsTokenMetadata,
          bagsInitialBuyLamports: projects.bagsInitialBuyLamports,
        })
        .from(projects)
        .where(
          and(
            eq(projects.ghOwner, parsed.ghOwner),
            eq(projects.ghRepo, parsed.ghRepo),
          ),
        )
        .limit(1);
      if (existing) {
        if (
          (existing.status === "live" ||
            existing.status === "simulated_live") &&
          existing.tokenMint
        ) {
          return {
            ok: true as const,
            projectId: existing.id,
            tokenMint: existing.tokenMint,
            status:
              existing.status === "simulated_live"
                ? ("simulated_live" as const)
                : ("live" as const),
            txSig: null,
            note: "Existing launched project — returned persisted token mint.",
          };
        }

        if (existing.status === "launch_configured") {
          if (isLaunchSubmissionPending(existing.bagsLaunchSignature)) {
            throw new Error("launch_requires_manual_reconciliation");
          }
          if (willStubMode) {
            throw new Error("live_credentials_required");
          }
          if (
            !existing.tokenMint ||
            !existing.bagsConfigKey ||
            !existing.bagsTokenMetadata
          ) {
            throw new Error("launch_config_incomplete");
          }
          const launchWallet =
            existing.bagsLaunchWallet ??
            existing.bagsPoolClaimerWallet ??
            payoutSignerPublicKey();
          if (!launchWallet) {
            throw new Error(
              "SOLANA_PAYOUT_KEYPAIR is required before live launch.",
            );
          }
          const guard = canLaunchOnBags();
          if (!guard.ok)
            throw new Error(`Refusing on-chain launch: ${guard.reason}`);

          await markDirectLaunchSubmissionPending(existing.id, {
            tokenMint: existing.tokenMint,
            configKey: existing.bagsConfigKey,
            metadataUrl: existing.bagsTokenMetadata,
            launchWallet,
            initialBuyLamports:
              existing.bagsInitialBuyLamports ??
              serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
          });

          const launch = await withIdempotency(
            deriveKey(
              "admin-direct-launch-final",
              existing.id,
              existing.tokenMint,
              existing.bagsConfigKey,
            ),
            () =>
              bags.createAndSubmitLaunchTransaction({
                tokenMint: existing.tokenMint!,
                metadataUrl: existing.bagsTokenMetadata!,
                configKey: existing.bagsConfigKey!,
                launchWallet,
                initialBuyLamports:
                  existing.bagsInitialBuyLamports ??
                  serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
              }),
            { scope: `admin:direct-launch:final:${existing.id}` },
          );
          const now = new Date();
          const [completed] = await dbHttp
            .update(projects)
            .set({
              bagsLaunchId: launch.signature,
              bagsLaunchSignature: launch.signature,
              bagsLaunchWallet: launchWallet,
              status: "live",
              simulatedAt: null,
              updatedAt: now,
            })
            .where(eq(projects.id, existing.id))
            .returning({ id: projects.id });
          if (!completed) {
            throw new Error("launch_complete_persist_failed");
          }

          await audit({
            actorUserId: ctx.userId,
            action: "project.launch_complete",
            targetType: "project",
            targetId: existing.id,
            metadata: {
              directLaunch: true,
              resumed: true,
              tokenMint: existing.tokenMint,
              bagsConfigKey: existing.bagsConfigKey,
              launchSignature: launch.signature,
              launchWallet,
              initialBuyLamports:
                existing.bagsInitialBuyLamports ??
                serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
            },
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          });

          return {
            ok: true as const,
            projectId: existing.id,
            tokenMint: existing.tokenMint,
            status: "live" as const,
            txSig: launch.signature,
            note: "Bags launch transaction broadcast. Token is live.",
          };
        }

        if (
          existing.status !== "draft" ||
          existing.ownerUserId !== ctx.userId
        ) {
          throw new Error("repo_already_exists");
        }
      }

      let projectId = existing?.id;
      if (!projectId) {
        projectId = await dbp.transaction(async (tx) => {
          await applyDbRlsContext(tx);
          const [inserted] = await tx
            .insert(projects)
            .values({
              ownerUserId: ctx.userId,
              ghOwner: parsed.ghOwner,
              ghRepo: parsed.ghRepo,
              ghRepoId: parsed.ghRepoId,
              ghInstallationId: parsed.ghInstallationId ?? null,
              name: parsed.name,
              symbol: parsed.symbol,
              description: parsed.description ?? null,
              imageUrl: parsed.imageUrl,
              tokenWebsiteUrl: parsed.website ?? null,
              tokenTwitterUrl: parsed.twitter ?? null,
              tokenTelegramUrl: parsed.telegram ?? null,
              status: "draft",
              platformFeeBps: parsed.platformFeeBps,
              scoringConfig: parsed.scoringConfig,
              payoutConfig: parsed.payoutConfig,
            })
            .returning({ id: projects.id });
          if (!inserted) throw new Error("Project insert returned no row.");

          await tx.insert(projectMemberships).values({
            userId: ctx.userId,
            projectId: inserted.id,
            role: "project_owner",
          });
          return inserted.id;
        });

        await audit({
          actorUserId: ctx.userId,
          action: "project.create",
          targetType: "project",
          targetId: projectId,
          metadata: {
            ghOwner: parsed.ghOwner,
            ghRepo: parsed.ghRepo,
            ghRepoId: parsed.ghRepoId,
            directLaunch: true,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }

      const tokenInfo = await withIdempotency(
        deriveKey("admin-direct-launch-token-info", projectId),
        () =>
          bags.createTokenInfo({
            name: parsed.name,
            symbol: parsed.symbol,
            description: parsed.description,
            imageUrl: parsed.imageUrl,
            website: parsed.website,
            twitter: parsed.twitter,
            telegram: parsed.telegram,
          }),
        { scope: `admin:direct-launch:token-info:${projectId}` },
      );
      const isStub = Boolean(tokenInfo.__stub);

      const payoutWallet = payoutSignerPublicKey();
      if (!isStub && !payoutWallet) {
        throw new Error(
          "SOLANA_PAYOUT_KEYPAIR is required before live launch.",
        );
      }
      const stubPoolWallet = isStub
        ? (await bags.resolveWallet("github", "gitshipt-platform")).wallet
        : null;
      const poolClaimerWallet = payoutWallet ?? stubPoolWallet;
      if (!poolClaimerWallet) {
        throw new Error("Unable to derive the Bags pool claimer wallet.");
      }

      const feeShareConfig = await withIdempotency(
        deriveKey(
          "admin-direct-launch-fee-config",
          projectId,
          tokenInfo.tokenMint,
        ),
        () =>
          bags.createFeeShareConfig({
            payer: poolClaimerWallet,
            baseMint: tokenInfo.tokenMint,
            feeClaimers: [
              {
                wallet: poolClaimerWallet,
                bps: 10_000 - parsed.platformFeeBps,
              },
            ],
            platformFeeWallet: serverEnv().SOLANA_TREASURY_ADDRESS,
            shareFee: parsed.platformFeeBps,
          }),
        { scope: `admin:direct-launch:fee-config:${projectId}` },
      );

      let txSig = feeShareConfig.txSignatures.at(-1) ?? null;
      let launchSignature: string | null = null;
      let note: string | undefined;
      if (isStub) {
        note = "Stub mode — token mint is fake; no on-chain transaction sent.";
      } else {
        const guard = canLaunchOnBags();
        if (!guard.ok)
          throw new Error(`Refusing on-chain launch: ${guard.reason}`);
        const configuredAt = new Date();
        await dbHttp
          .update(projects)
          .set({
            tokenMint: tokenInfo.tokenMint,
            bagsLaunchId: null,
            bagsConfigKey: feeShareConfig.configKey,
            bagsLaunchSignature: null,
            bagsLaunchWallet: poolClaimerWallet,
            bagsPoolClaimerWallet: poolClaimerWallet,
            bagsTokenMetadata: tokenInfo.tokenMetadata,
            bagsInitialBuyLamports: serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
            status: "launch_configured",
            simulatedAt: null,
            updatedAt: configuredAt,
          })
          .where(eq(projects.id, projectId));

        await audit({
          actorUserId: ctx.userId,
          action: "project.launch",
          targetType: "project",
          targetId: projectId,
          metadata: {
            directLaunch: true,
            phase: "configured",
            tokenMint: tokenInfo.tokenMint,
            bagsConfigKey: feeShareConfig.configKey,
            feeShareConfigSignatures: feeShareConfig.txSignatures,
            poolClaimerWallet,
            platformFeeBps: parsed.platformFeeBps,
            stub: false,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });

        await markDirectLaunchSubmissionPending(projectId, {
          tokenMint: tokenInfo.tokenMint,
          configKey: feeShareConfig.configKey,
          metadataUrl: tokenInfo.tokenMetadata,
          launchWallet: poolClaimerWallet,
          initialBuyLamports: serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
        });

        const launch = await withIdempotency(
          deriveKey(
            "admin-direct-launch-final",
            projectId,
            tokenInfo.tokenMint,
            feeShareConfig.configKey,
          ),
          () =>
            bags.createAndSubmitLaunchTransaction({
              tokenMint: tokenInfo.tokenMint,
              metadataUrl: tokenInfo.tokenMetadata,
              configKey: feeShareConfig.configKey,
              launchWallet: poolClaimerWallet,
              initialBuyLamports: serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
            }),
          { scope: `admin:direct-launch:final:${projectId}` },
        );
        launchSignature = launch.signature;
        txSig = launch.signature;
        note = "Bags launch transaction broadcast. Token is live.";
      }

      const now = new Date();
      const [updated] = await dbHttp
        .update(projects)
        .set({
          tokenMint: tokenInfo.tokenMint,
          bagsLaunchId: isStub ? feeShareConfig.configKey : launchSignature,
          bagsConfigKey: feeShareConfig.configKey,
          bagsLaunchSignature: launchSignature,
          bagsLaunchWallet: isStub ? null : poolClaimerWallet,
          bagsPoolClaimerWallet: poolClaimerWallet,
          bagsTokenMetadata: tokenInfo.tokenMetadata,
          bagsInitialBuyLamports: serverEnv().BAGS_INITIAL_BUY_LAMPORTS,
          status: isStub ? "simulated_live" : "live",
          simulatedAt: isStub ? now : null,
          updatedAt: now,
        })
        .where(eq(projects.id, projectId))
        .returning({ id: projects.id });
      if (!updated) {
        throw new Error("launch_complete_persist_failed");
      }

      await audit({
        actorUserId: ctx.userId,
        action: "project.launch_complete",
        targetType: "project",
        targetId: projectId,
        metadata: {
          directLaunch: true,
          tokenMint: tokenInfo.tokenMint,
          bagsConfigKey: feeShareConfig.configKey,
          feeShareConfigSignatures: feeShareConfig.txSignatures,
          launchSignature,
          poolClaimerWallet,
          platformFeeBps: parsed.platformFeeBps,
          stub: isStub,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return {
        ok: true as const,
        projectId,
        tokenMint: tokenInfo.tokenMint,
        status: isStub ? ("simulated_live" as const) : ("live" as const),
        txSig,
        note,
      };
    },
    { scope: `admin:direct-launch:${ctx.userId}` },
  );

  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${result.projectId}`);
  revalidatePath(`/r/${parsed.ghOwner}/${parsed.ghRepo}`);
  await updateProjectCaches(
    result.projectId,
    `${parsed.ghOwner}/${parsed.ghRepo}`,
  );
  return result;
}

interface DirectLaunchPendingConfig {
  tokenMint: string;
  configKey: string;
  metadataUrl: string;
  launchWallet: string;
  initialBuyLamports: number;
}

function isLaunchSubmissionPending(signature: string | null): boolean {
  return signature?.startsWith(LAUNCH_SUBMISSION_PENDING_PREFIX) ?? false;
}

function directLaunchPendingSignature(
  config: DirectLaunchPendingConfig,
): string {
  return `${LAUNCH_SUBMISSION_PENDING_PREFIX}${config.configKey}`;
}

async function markDirectLaunchSubmissionPending(
  projectId: string,
  config: DirectLaunchPendingConfig,
): Promise<void> {
  const [updated] = await dbHttp
    .update(projects)
    .set({
      tokenMint: config.tokenMint,
      bagsConfigKey: config.configKey,
      bagsLaunchSignature: directLaunchPendingSignature(config),
      bagsLaunchWallet: config.launchWallet,
      bagsTokenMetadata: config.metadataUrl,
      bagsInitialBuyLamports: config.initialBuyLamports,
      status: "launch_configured",
      simulatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  if (!updated) {
    throw new Error("launch_pending_persist_failed");
  }
}

const ProjectActionSchema = DestructiveBaseSchema.extend({
  projectId: z.string().min(1),
});

export async function pauseProject(input: unknown): Promise<{ ok: true }> {
  const parsed = ProjectActionSchema.parse(input);
  const ctx = await requireSession();

  const [proj] = await dbHttp
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, parsed.projectId))
    .limit(1);
  if (!proj) throw new Error("project_not_found");

  await withIdempotency(
    parsed.idempotencyKey ?? deriveKey("admin-pause", proj.id, ctx.userId),
    async () => {
      await destructiveAction(
        {
          actorUserId: ctx.userId,
          permission: "project.pause",
          projectId: proj.id,
          reason: parsed.reason,
          targetName: proj.name,
          typedConfirmation: parsed.typedConfirmation,
          mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        {
          action: "project.pause",
          targetType: "project",
          targetId: proj.id,
          metadata: { previousStatus: proj.id },
        },
        async () => {
          await dbHttp
            .update(projects)
            .set({
              status: "paused",
              pausedAt: new Date(),
              pausedReason: parsed.reason.slice(0, 500),
            })
            .where(eq(projects.id, proj.id));
        },
      );
      return { ok: true } as const;
    },
    { scope: `admin:project:pause:${proj.id}:${ctx.userId}` },
  );

  revalidatePath(`/admin/projects/${proj.id}`);
  revalidatePath("/admin/projects");
  await updateProjectCaches(proj.id);
  return { ok: true };
}

export async function killProject(input: unknown): Promise<AdminActionResult> {
  const parsed = ProjectActionSchema.parse(input);
  const ctx = await requireSession();

  const [proj] = await dbHttp
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, parsed.projectId))
    .limit(1);
  if (!proj) throw new Error("project_not_found");

  const idempotencyKey =
    parsed.idempotencyKey ?? deriveKey("admin-kill", proj.id, ctx.userId);

  const result = await withIdempotency(
    idempotencyKey,
    async () =>
      runDestructiveAction(async () => {
        await destructiveAction(
          {
            actorUserId: ctx.userId,
            permission: "project.kill",
            projectId: proj.id,
            reason: parsed.reason,
            targetName: proj.name,
            typedConfirmation: parsed.typedConfirmation,
            mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            cosign: irreversibleCosign({
              pendingActionId: parsed.pendingActionId,
              idempotencyKey,
            }),
          },
          {
            action: "project.kill",
            targetType: "project",
            targetId: proj.id,
          },
          async () => {
            await dbHttp
              .update(projects)
              .set({ status: "killed", killedAt: new Date() })
              .where(eq(projects.id, proj.id));
          },
        );
        return { ok: true } as const;
      }),
    { scope: `admin:project:kill:${proj.id}:${ctx.userId}` },
  );
  if (!result.ok) return result;

  revalidatePath(`/admin/projects/${proj.id}`);
  revalidatePath("/admin/projects");
  await updateProjectCaches(proj.id);
  return result;
}

const UpdateScoringSchema = z.object({
  projectId: z.string().min(1),
  scoringConfig: ScoringConfigSchema,
  idempotencyKey: z.string().min(8).optional(),
});

export async function overrideScoringConfig(
  input: unknown,
): Promise<{ ok: true }> {
  const parsed = UpdateScoringSchema.parse(input);
  const ctx = await requireSession();

  await requirePermission("scoring.update", {
    userId: ctx.userId,
    projectId: parsed.projectId,
  });

  await withIdempotency(
    parsed.idempotencyKey ?? null,
    async () => {
      await dbHttp
        .update(projects)
        .set({ scoringConfig: parsed.scoringConfig })
        .where(eq(projects.id, parsed.projectId));
      await audit({
        actorUserId: ctx.userId,
        action: "scoring.update",
        targetType: "project",
        targetId: parsed.projectId,
        metadata: { override: true, scoringConfig: parsed.scoringConfig },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    },
    { scope: `admin:scoring:${parsed.projectId}:${ctx.userId}` },
  );

  revalidatePath(`/admin/projects/${parsed.projectId}`);
  await updateProjectCaches(parsed.projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

// Legacy payout retry/cancel actions deleted with the off-chain dispatch
// loop. Under the Bags-native architecture there is no per-recipient
// dispatch to retry — the cadence cron either re-runs the BPS rebalance
// (idempotent on plan_hash) or fails loudly and is reset by the operator
// flipping the schedule's `paused_at`.

const ForceSnapshotSchema = z.object({
  projectId: z.string().min(1),
  idempotencyKey: z.string().min(8).optional(),
});

export async function forceSnapshot(
  input: unknown,
): Promise<{ ok: true; runId: string | null }> {
  const parsed = ForceSnapshotSchema.parse(input);
  const ctx = await requireSession();

  await requirePermission("snapshot.force", {
    userId: ctx.userId,
    projectId: parsed.projectId,
  });

  const runId = await withIdempotency(
    parsed.idempotencyKey ?? `snapshot:force:${parsed.projectId}`,
    async () => {
      const run = await start(takeProjectSnapshot, [parsed.projectId]);
      const value = {
        projectId: parsed.projectId,
        requestedBy: ctx.userId,
        requestedAt: new Date().toISOString(),
        runId: run.runId,
      };
      await dbHttp
        .insert(platformConfig)
        .values({
          key: `pending.snapshot.${parsed.projectId}`,
          value,
          updatedBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: platformConfig.key,
          set: { value, updatedBy: ctx.userId, updatedAt: new Date() },
        });
      await audit({
        actorUserId: ctx.userId,
        action: "snapshot.force",
        targetType: "project",
        targetId: parsed.projectId,
        metadata: { manualTrigger: true, runId: run.runId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return run.runId;
    },
    { scope: `admin:snapshot:force:${parsed.projectId}:${ctx.userId}` },
  );

  revalidatePath(`/admin/projects/${parsed.projectId}`);
  await updateProjectCaches(parsed.projectId);
  return { ok: true, runId };
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

const UpdateFeesSchema = DestructiveBaseSchema.extend({
  bps: z.number().int().min(200).max(10_000),
});

export async function updateFeesBps(
  input: unknown,
): Promise<{ ok: true; bps: number }> {
  const parsed = UpdateFeesSchema.parse(input);
  const ctx = await requireSession();

  await withIdempotency(
    parsed.idempotencyKey ?? deriveKey("admin-fees", parsed.bps, ctx.userId),
    async () => {
      await destructiveAction(
        {
          actorUserId: ctx.userId,
          permission: "platform.fees.update",
          reason: parsed.reason,
          targetName: "platform.fees.bps",
          typedConfirmation: parsed.typedConfirmation,
          mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        {
          action: "fees.update",
          targetType: "platform_config",
          targetId: "fees.platform_bps",
          metadata: { bps: parsed.bps },
        },
        async () => {
          const value = { value: parsed.bps, updatedBy: ctx.userId };
          await dbHttp
            .insert(platformConfig)
            .values({
              key: "fees.platform_bps",
              value,
              updatedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: platformConfig.key,
              set: { value, updatedBy: ctx.userId, updatedAt: new Date() },
            });
        },
      );
      return { ok: true } as const;
    },
    { scope: `admin:fees:${ctx.userId}` },
  );

  revalidatePath("/admin/fees");
  await updateAdminCaches();
  return { ok: true, bps: parsed.bps };
}

const UpdateProjectFeeShareSchema = DestructiveBaseSchema.extend({
  projectId: z.string().min(1),
  bps: z.number().int().min(200).max(10_000),
});

const ClaimPartnerFeesSchema = DestructiveBaseSchema.extend({
  partnerWallet: z.string().min(32).optional(),
});

export async function updateProjectPlatformFeeBps(
  input: unknown,
): Promise<{ ok: true; bps: number }> {
  const parsed = UpdateProjectFeeShareSchema.parse(input);
  const ctx = await requireSession();

  const [proj] = await dbHttp
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      platformFeeBps: projects.platformFeeBps,
      bagsConfigKey: projects.bagsConfigKey,
    })
    .from(projects)
    .where(eq(projects.id, parsed.projectId))
    .limit(1);
  if (!proj) throw new Error("project_not_found");

  if (proj.status !== "draft" || proj.bagsConfigKey) {
    throw new Error("fee_share_locked_after_launch_config");
  }

  await withIdempotency(
    parsed.idempotencyKey ??
      deriveKey("admin-project-fee", proj.id, parsed.bps, ctx.userId),
    async () => {
      await destructiveAction(
        {
          actorUserId: ctx.userId,
          permission: "platform.fees.update",
          projectId: proj.id,
          reason: parsed.reason,
          targetName: proj.name,
          typedConfirmation: parsed.typedConfirmation,
          mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        {
          action: "fees.update",
          targetType: "project",
          targetId: proj.id,
          metadata: {
            kind: "project_platform_fee_bps",
            previousBps: proj.platformFeeBps,
            bps: parsed.bps,
            contributorPoolBps: 10_000 - parsed.bps,
          },
        },
        async () => {
          await dbHttp
            .update(projects)
            .set({ platformFeeBps: parsed.bps, updatedAt: new Date() })
            .where(eq(projects.id, proj.id));
        },
      );
      return { ok: true } as const;
    },
    { scope: `admin:project-fee:${proj.id}:${ctx.userId}` },
  );

  revalidatePath(`/admin/projects/${proj.id}`);
  revalidatePath("/admin/fees");
  await updateProjectCaches(proj.id);
  return { ok: true, bps: parsed.bps };
}

export async function claimPartnerFees(input: unknown): Promise<
  | {
      ok: true;
      partnerWallet: string;
      attemptId: string;
      signatures: string[];
      before: { claimedFees: string; unclaimedFees: string };
      after: { claimedFees: string; unclaimedFees: string };
    }
  | PendingAdminApproval
> {
  const parsed = ClaimPartnerFeesSchema.parse(input);
  const ctx = await requireSession();
  const env = serverEnv();
  const partnerWallet = parsed.partnerWallet ?? env.BAGS_PARTNER_WALLET;

  if (!hasCredentials.bags()) throw new Error("BAGS_API_KEY missing");
  if (!env.BAGS_PARTNER_CONFIG_KEY) {
    throw new Error("BAGS_PARTNER_CONFIG_KEY missing");
  }
  const partnerConfigKey = env.BAGS_PARTNER_CONFIG_KEY;

  const signerWallet = payoutSignerPublicKey();
  if (!signerWallet) throw new Error("SOLANA_PAYOUT_KEYPAIR missing");
  if (signerWallet !== partnerWallet) {
    throw new Error(
      "partner_wallet_signer_unavailable: BAGS_PARTNER_WALLET must match SOLANA_PAYOUT_KEYPAIR for server-side partner claims.",
    );
  }

  const idempotencyKey =
    parsed.idempotencyKey ??
    deriveKey("admin-partner-fees-claim", partnerWallet, ctx.userId);

  const result = await withIdempotency(
    idempotencyKey,
    async () =>
      runDestructiveAction(() =>
        destructiveAction(
          {
            actorUserId: ctx.userId,
            permission: "platform.treasury.topup",
            reason: parsed.reason,
            targetName: "partner.fees.claim",
            typedConfirmation: parsed.typedConfirmation,
            mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            cosign: irreversibleCosign({
              pendingActionId: parsed.pendingActionId,
              idempotencyKey,
            }),
          },
          {
            action: "treasury.partner_claim",
            targetType: "partner_config",
            targetId: partnerConfigKey,
            metadata: { partnerWallet },
          },
          async ({ idempotencyKey: executionIdempotencyKey }) => {
            const attempt = await reservePartnerFeeClaimAttempt({
              partnerWallet,
              partnerConfigKey,
              idempotencyKey: executionIdempotencyKey ?? idempotencyKey,
            });
            const claim = await executePartnerFeeClaimAttempt(attempt.id);
            if (claim.status !== "succeeded" || !claim.before || !claim.after) {
              throw new Error(claim.reason ?? "partner_fee_claim_failed");
            }
            await audit({
              actorUserId: ctx.userId,
              action: "treasury.partner_claim",
              targetType: "partner_config",
              targetId: partnerConfigKey,
              metadata: {
                partnerWallet,
                attemptId: attempt.id,
                phase: "settled",
                signatures: claim.signatures,
                before: claim.before,
                after: claim.after,
                claimedDeltaLamports: claim.claimedDeltaLamports,
                unclaimedDeltaLamports: claim.unclaimedDeltaLamports,
              },
              ip: ctx.ip,
              userAgent: ctx.userAgent,
            });
            return {
              ok: true as const,
              partnerWallet,
              attemptId: attempt.id,
              signatures: claim.signatures,
              before: claim.before,
              after: claim.after,
            };
          },
        ),
      ),
    { scope: `admin:partner-fees:claim:${partnerWallet}` },
  );
  if (!result.ok) return result;

  revalidatePath("/admin/fees");
  await updateAdminCaches();
  return result;
}

// ---------------------------------------------------------------------------
// Kill switch + maintenance
// ---------------------------------------------------------------------------

const KillSwitchSchema = DestructiveBaseSchema.extend({
  enabled: z.boolean(),
});

export async function toggleKillSwitch(
  input: unknown,
): Promise<{ ok: true; enabled: boolean }> {
  const parsed = KillSwitchSchema.parse(input);
  const ctx = await requireSession();

  // Confirmation copy requirement: see /admin/maintenance UI — the operator
  // must type "ENABLE KILL SWITCH" or "DISABLE KILL SWITCH" depending on
  // direction. We compute the canonical name here.
  const targetName = parsed.enabled
    ? "ENABLE KILL SWITCH"
    : "DISABLE KILL SWITCH";

  await withIdempotency(
    parsed.idempotencyKey ??
      deriveKey("admin-kill-switch", parsed.enabled ? 1 : 0, ctx.userId),
    async () => {
      await destructiveAction(
        {
          actorUserId: ctx.userId,
          permission: "platform.kill_switch",
          reason: parsed.reason,
          targetName,
          typedConfirmation: parsed.typedConfirmation,
          mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        {
          action: "kill_switch.toggle",
          targetType: "platform_config",
          targetId: "kill_switch.global",
          metadata: { enabled: parsed.enabled, reason: parsed.reason },
        },
        async () => {
          const value = {
            enabled: parsed.enabled,
            reason: parsed.reason.slice(0, 500),
            toggledBy: ctx.userId,
            toggledAt: new Date().toISOString(),
          };
          await dbHttp
            .insert(platformConfig)
            .values({
              key: "kill_switch.global",
              value,
              updatedBy: ctx.userId,
            })
            .onConflictDoUpdate({
              target: platformConfig.key,
              set: { value, updatedBy: ctx.userId, updatedAt: new Date() },
            });
        },
      );
      return { ok: true } as const;
    },
    { scope: `admin:kill-switch:${ctx.userId}` },
  );

  revalidatePath("/admin/maintenance");
  await updateAdminCaches();
  return { ok: true, enabled: parsed.enabled };
}

const BannerSchema = z.object({
  message: z.string().max(500),
  visible: z.boolean(),
});

export async function updateBanner(input: unknown): Promise<{ ok: true }> {
  const parsed = BannerSchema.parse(input);
  const ctx = await requireSession();

  await requirePermission("platform.maintenance", { userId: ctx.userId });

  await withIdempotency(
    deriveKey("banner", ctx.userId, parsed.visible ? 1 : 0, parsed.message),
    async () => {
      const value = {
        message: parsed.message,
        visible: parsed.visible,
        updatedBy: ctx.userId,
        updatedAt: new Date().toISOString(),
      };
      await dbHttp
        .insert(platformConfig)
        .values({ key: "banner.global", value, updatedBy: ctx.userId })
        .onConflictDoUpdate({
          target: platformConfig.key,
          set: { value, updatedBy: ctx.userId, updatedAt: new Date() },
        });

      await audit({
        actorUserId: ctx.userId,
        action: "admin.access",
        targetType: "platform_config",
        targetId: "banner.global",
        metadata: { ...parsed },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: true } as const;
    },
    { scope: `admin:banner:${ctx.userId}` },
  );

  revalidatePath("/admin/maintenance");
  await updateAdminCaches();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const GrantRoleSchema = DestructiveBaseSchema.extend({
  userId: z.string().min(1),
  role: z.enum(["user", "moderator", "admin", "super_admin"]),
});

export async function grantRole(input: unknown): Promise<AdminActionResult> {
  const parsed = GrantRoleSchema.parse(input);
  const ctx = await requireSession();

  const [target] = await dbHttp
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, parsed.userId))
    .limit(1);
  if (!target) throw new Error("user_not_found");

  const idempotencyKey =
    parsed.idempotencyKey ??
    deriveKey("admin-grant-role", target.id, parsed.role, ctx.userId);

  const result = await withIdempotency(
    idempotencyKey,
    async () =>
      runDestructiveAction(async () => {
        await destructiveAction(
          {
            actorUserId: ctx.userId,
            permission: "admin.users.role.grant",
            reason: parsed.reason,
            targetName: target.name,
            typedConfirmation: parsed.typedConfirmation,
            mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            cosign:
              parsed.role === "super_admin"
                ? irreversibleCosign({
                    pendingActionId: parsed.pendingActionId,
                    idempotencyKey,
                  })
                : undefined,
          },
          {
            action: "user.role_grant",
            targetType: "user",
            targetId: target.id,
            metadata: { previousRole: target.role, newRole: parsed.role },
          },
          async () => {
            await dbHttp
              .update(users)
              .set({ role: parsed.role })
              .where(eq(users.id, target.id));
          },
        );
        return { ok: true } as const;
      }),
    { scope: `admin:user:grant-role:${target.id}:${ctx.userId}` },
  );
  if (!result.ok) return result;

  revalidatePath("/admin/users");
  await updateAdminCaches();
  await updateUserCaches(target.id);
  return result;
}

const ResetMfaSchema = DestructiveBaseSchema.extend({
  userId: z.string().min(1),
});

export async function resetUserMfa(input: unknown): Promise<{ ok: true }> {
  const parsed = ResetMfaSchema.parse(input);
  const ctx = await requireSession();

  const [target] = await dbHttp
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, parsed.userId))
    .limit(1);
  if (!target) throw new Error("user_not_found");

  await withIdempotency(
    parsed.idempotencyKey ??
      deriveKey("admin-reset-mfa", target.id, ctx.userId),
    async () => {
      await destructiveAction(
        {
          actorUserId: ctx.userId,
          permission: "admin.users.role.grant",
          reason: parsed.reason,
          targetName: target.name,
          typedConfirmation: parsed.typedConfirmation,
          mfaConfirmedAtMs: parsed.mfaConfirmedAtMs,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        {
          action: "admin.access",
          targetType: "user",
          targetId: target.id,
          metadata: { op: "reset_mfa" },
        },
        async () => {
          await dbHttp
            .update(users)
            .set({ mfaSecretEnc: null })
            .where(eq(users.id, target.id));
        },
      );
      return { ok: true } as const;
    },
    { scope: `admin:user:reset-mfa:${target.id}:${ctx.userId}` },
  );

  revalidatePath("/admin/users");
  await updateAdminCaches();
  await updateUserCaches(target.id);
  return { ok: true };
}

const SybilFlagSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(20),
  idempotencyKey: z.string().min(8).optional(),
});

export async function sybilFlagUser(input: unknown): Promise<{ ok: true }> {
  const parsed = SybilFlagSchema.parse(input);
  const ctx = await requireSession();

  await requirePermission("admin.users.role.grant", { userId: ctx.userId });

  await withIdempotency(
    parsed.idempotencyKey ??
      deriveKey("admin-sybil-flag", parsed.userId, parsed.reason, ctx.userId),
    async () => {
      await audit({
        actorUserId: ctx.userId,
        action: "admin.access",
        targetType: "user",
        targetId: parsed.userId,
        metadata: { kind: "abuse.sybil_flag", reason: parsed.reason },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: true } as const;
    },
    { scope: `admin:user:sybil:${parsed.userId}:${ctx.userId}` },
  );

  revalidatePath("/admin/users");
  revalidatePath("/admin/abuse");
  await updateAdminCaches();
  await updateUserCaches(parsed.userId);
  return { ok: true };
}

// Legacy hot-wallet top-up action deleted with the off-chain dispatch loop.
// The Bags-native architecture has no hot wallet — the manager keypair only
// pays tx fees and is topped up out-of-band by the operator if it ever runs
// low. No admin action surface needed for that.

// ---------------------------------------------------------------------------
// Workflow re-trigger
// ---------------------------------------------------------------------------

const TriggerWorkflowSchema = z.object({
  name: z.enum([
    "healthPulse",
    "indexGithubDeltas",
    "takeSnapshot",
    "rebalanceBps",
    "publishKpis",
  ]),
  idempotencyKey: z.string().min(8).optional(),
});

async function requireWorkflowRetriggerPermission(
  workflowName: AdminWorkflowName,
  userId: string,
): Promise<void> {
  await requirePermission(workflowRetriggerPermission(workflowName), {
    userId,
  });
}

export async function retriggerWorkflow(
  input: unknown,
): Promise<{ ok: true; runId?: string }> {
  const parsed = TriggerWorkflowSchema.parse(input);
  const ctx = await requireSession();

  await requireWorkflowRetriggerPermission(parsed.name, ctx.userId);

  const run = await withIdempotency(
    parsed.idempotencyKey ??
      deriveKey("admin-workflow", parsed.name, ctx.userId, Date.now()),
    async () => {
      const workflowRun =
        parsed.name === "healthPulse"
          ? await start(healthPulse, [])
          : parsed.name === "indexGithubDeltas"
            ? await start(indexGithubDeltas, [])
            : parsed.name === "takeSnapshot"
              ? await start(takeSnapshot, [])
              : parsed.name === "rebalanceBps"
                ? await start(rebalanceBps, [])
                : await start(publishKpis, []);

      await audit({
        actorUserId: ctx.userId,
        action: "admin.access",
        targetType: "workflow",
        targetId: parsed.name,
        metadata: { kind: "retrigger", runId: workflowRun.runId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { runId: workflowRun.runId };
    },
    { scope: `admin:workflow:${parsed.name}:${ctx.userId}` },
  );

  return { ok: true, runId: run.runId };
}

// ---------------------------------------------------------------------------
// Snapshot leaderboard helpers
// ---------------------------------------------------------------------------

const RecomputeLeaderboardSchema = z.object({
  projectId: z.string().min(1),
  idempotencyKey: z.string().min(8).optional(),
});

export async function recomputeLeaderboard(
  input: unknown,
): Promise<{ ok: true; runId: string }> {
  const parsed = RecomputeLeaderboardSchema.parse(input);
  const ctx = await requireSession();

  await requirePermission("scoring.update", {
    userId: ctx.userId,
    projectId: parsed.projectId,
  });

  const run = await withIdempotency(
    parsed.idempotencyKey ??
      deriveKey("admin-recompute", parsed.projectId, ctx.userId, Date.now()),
    async () => {
      const workflowRun = await start(computeLeaderboardWorkflow, [
        parsed.projectId,
      ]);

      await audit({
        actorUserId: ctx.userId,
        action: "scoring.update",
        targetType: "project",
        targetId: parsed.projectId,
        metadata: {
          kind: "recompute_leaderboard",
          runId: workflowRun.runId,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { runId: workflowRun.runId };
    },
    { scope: `admin:recompute:${parsed.projectId}:${ctx.userId}` },
  );

  revalidatePath(`/admin/projects/${parsed.projectId}`);
  await updateProjectCaches(parsed.projectId);
  return { ok: true, runId: run.runId };
}

const UpdatePayoutConfigSchema = z.object({
  projectId: z.string().min(1),
  payoutConfig: PayoutConfigSchema,
});

export async function updatePayoutConfig(
  input: unknown,
): Promise<{ ok: true }> {
  const parsed = UpdatePayoutConfigSchema.parse(input);
  const ctx = await requireSession();
  await requirePermission("project.update", {
    userId: ctx.userId,
    projectId: parsed.projectId,
  });
  await withIdempotency(
    deriveKey(
      "payout-config",
      parsed.projectId,
      ctx.userId,
      JSON.stringify(parsed.payoutConfig),
    ),
    async () => {
      await dbHttp
        .update(projects)
        .set({ payoutConfig: parsed.payoutConfig satisfies PayoutConfig })
        .where(eq(projects.id, parsed.projectId));
      await audit({
        actorUserId: ctx.userId,
        action: "scoring.update",
        targetType: "project",
        targetId: parsed.projectId,
        metadata: { kind: "payout_config_override" },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: true } as const;
    },
    { scope: `admin:payout-config:${parsed.projectId}:${ctx.userId}` },
  );
  revalidatePath(`/admin/projects/${parsed.projectId}`);
  await updateProjectCaches(parsed.projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Audit CSV export
// ---------------------------------------------------------------------------

const AuditExportSchema = z.object({
  prefix: z.string().optional(),
  targetId: z.string().optional(),
  targetType: z.string().optional(),
  sinceMs: z.number().int().positive().optional(),
});

export async function exportAuditCsv(
  input: unknown,
): Promise<{ ok: true; csv: string }> {
  const parsed = AuditExportSchema.parse(input ?? {});
  const ctx = await requireSession();
  await requirePermission("admin.audit.read", { userId: ctx.userId });
  const { getAuditLogs } = await import("@/lib/queries/admin");
  const rows = await getAuditLogs({
    actionPrefix: parsed.prefix,
    targetId: parsed.targetId,
    targetType: parsed.targetType,
    sinceMs: parsed.sinceMs,
    limit: 500,
  });

  const header = [
    "id",
    "createdAt",
    "actorUserId",
    "actorName",
    "action",
    "targetType",
    "targetId",
    "metadata",
  ].join(",");
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.id,
      r.createdAt.toISOString(),
      r.actorUserId ?? "",
      escape(r.actorName ?? ""),
      r.action,
      r.targetType,
      r.targetId,
      escape(JSON.stringify(r.metadata)),
    ].join(","),
  );

  await audit({
    actorUserId: ctx.userId,
    action: "admin.access",
    targetType: "audit_log",
    targetId: "csv_export",
    metadata: {
      prefix: parsed.prefix ?? null,
      targetId: parsed.targetId ?? null,
      targetType: parsed.targetType ?? null,
      count: rows.length,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { ok: true, csv: [header, ...lines].join("\n") };
}

// Re-export so client code can import + check error type cleanly.
export { DestructiveActionError };
// Force serverEnv import to retain so tree-shaking doesn't elide it; it's used
// by destructive-action transitively but importing here keeps the boundary obvious.
void serverEnv;
void snapshots;
