import { z } from "zod";

export const ApiErrorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  details: z.unknown().optional(),
  issues: z.unknown().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const WalletNonceRequestSchema = z.object({
  address: z.string().min(32).max(44),
});
export type WalletNonceRequest = z.infer<typeof WalletNonceRequestSchema>;

export const WalletNonceResponseSchema = z.object({
  nonce: z.string().min(1),
  ttlSeconds: z.number().int().positive(),
});
export type WalletNonceResponse = z.infer<typeof WalletNonceResponseSchema>;

export const WalletVerifyResponseSchema = z.object({
  ok: z.literal(true),
  address: z.string().min(32).max(44),
});
export type WalletVerifyResponse = z.infer<typeof WalletVerifyResponseSchema>;

export const ProjectLeaderboardRowSchema = z.object({
  rank: z.number().int().positive(),
  contributorId: z.string().min(1),
  ghUserId: z.string().min(1),
  ghUsername: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
  score: z.number(),
  inputs: z.object({
    mergedPRs: z.number().int().min(0),
    commits: z.number().int().min(0),
    reviews: z.number().int().min(0),
    issues: z.number().int().min(0),
    netLines: z.number().int(),
  }),
  weight: z.number().min(0).max(1),
  weightPercent: z.number().min(0).max(100),
  isWalletLinked: z.boolean(),
});
export type ProjectLeaderboardRow = z.infer<typeof ProjectLeaderboardRowSchema>;

export const ProjectLeaderboardResponseSchema = z.object({
  projectId: z.string().min(1),
  slug: z.string().min(1),
  generatedAt: z.string().datetime(),
  leaderboard: z.array(ProjectLeaderboardRowSchema),
});
export type ProjectLeaderboardResponse = z.infer<
  typeof ProjectLeaderboardResponseSchema
>;

export const MfaEnrollResponseSchema = z.object({
  qrDataUrl: z.string().min(1),
  secretBase32: z.string().min(1),
});
export type MfaEnrollResponse = z.infer<typeof MfaEnrollResponseSchema>;

export const MfaVerifyResponseSchema = z.object({
  ok: z.literal(true),
  confirmedAt: z.string().min(1),
});
export type MfaVerifyResponse = z.infer<typeof MfaVerifyResponseSchema>;
