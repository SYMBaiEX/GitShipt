import { z } from "zod";

// Solana addresses are base58-encoded ed25519 public keys: 32 raw bytes,
// which encode to 32–44 base58 characters. The shared package keeps no
// dependency on bs58 (apps/web has it; packages/shared stays pure), so we
// approximate the check with a base58-alphabet regex + the canonical
// length window. Anything that passes this gate still has to go through
// `new PublicKey(...)` in the bags-client wrappers, which is the
// authoritative parser.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const SolanaAddress = z
  .string()
  .min(32, "address too short")
  .max(44, "address too long")
  .regex(BASE58_RE, "address must be base58-encoded");

// Solana ed25519 signatures are 64 raw bytes → 87–88 base58 characters.
const SolanaSignature = z
  .string()
  .min(87, "signature too short")
  .max(88, "signature too long")
  .regex(BASE58_RE, "signature must be base58-encoded");

/**
 * Sentinel transaction string written by the bags-client stub when no
 * BAGS_API_KEY is present. The DexscreenerOrderDialog client component
 * checks for this exact value to skip the wallet-signing leg and treat
 * the order as immediately `stub_paid`.
 */
export const DEXSCREENER_STUB_TX_SENTINEL = "stub:dexscreener:tx" as const;

/** Real DexScreener Enhanced Token Info price as of April 2026. */
export const DEXSCREENER_PRICE_USDC = 299 as const;

export const DexscreenerOrderLinkSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).optional(),
});
export type DexscreenerOrderLink = z.infer<typeof DexscreenerOrderLinkSchema>;

export const DexscreenerAvailabilitySchema = z.object({
  available: z.boolean(),
});
export type DexscreenerAvailability = z.infer<
  typeof DexscreenerAvailabilitySchema
>;

export const DexscreenerOrderInputSchema = z.object({
  tokenAddress: SolanaAddress,
  description: z.string().min(1).max(5000),
  iconImageUrl: z.string().url(),
  headerImageUrl: z.string().url(),
  payerWallet: SolanaAddress,
  links: z.array(DexscreenerOrderLinkSchema).optional(),
  payWithSol: z.boolean().optional(),
});
export type DexscreenerOrderInput = z.infer<typeof DexscreenerOrderInputSchema>;

export const DexscreenerOrderSchema = z.object({
  orderUUID: z.string().min(1),
  recipientWallet: SolanaAddress,
  priceUSDC: z.number().positive(),
  transaction: z.unknown(),
  lastValidBlockHeight: z.number().int().positive(),
});
export type DexscreenerOrder = z.infer<typeof DexscreenerOrderSchema>;

/**
 * Server Action input — what the client sends to start an upgrade.
 *
 * `description` and `iconImageUrl` are optional overrides; when omitted
 * the action falls back to the project's existing description / image.
 * `headerImageUrl` is always required because we don't store one on the
 * project today (decided in plan).
 */
export const CreateDexscreenerOrderInputSchema = z.object({
  projectId: z.string().min(1),
  payerWallet: SolanaAddress,
  headerImageUrl: z.string().url(),
  descriptionOverride: z.string().min(1).max(5000).optional(),
  iconImageUrlOverride: z.string().url().optional(),
  links: z.array(DexscreenerOrderLinkSchema).max(8).optional(),
  payWithSol: z.boolean().optional(),
});
export type CreateDexscreenerOrderInput = z.infer<
  typeof CreateDexscreenerOrderInputSchema
>;

// Stub-mode signatures are short sentinel strings (`stub-ds-payment-...`)
// that don't pass real base58 validation. Accept either form so the
// stub_paid path doesn't require a separate schema; the action layer
// disambiguates via the row's `stub` flag.
const STUB_SIGNATURE_RE = /^stub-ds-payment-/;

export const SubmitDexscreenerPaymentInputSchema = z.object({
  orderUuid: z.string().min(1),
  paymentSignature: z
    .string()
    .refine(
      (v) => STUB_SIGNATURE_RE.test(v) || SolanaSignature.safeParse(v).success,
      "paymentSignature must be a base58 Solana signature",
    ),
});
export type SubmitDexscreenerPaymentInput = z.infer<
  typeof SubmitDexscreenerPaymentInputSchema
>;

/**
 * Public DTO for surfacing an order to UI. Strips the server-supplied
 * tx blob (which is large and would re-expose tx bytes the client
 * already broadcast) and audit-only fields.
 */
export const DexscreenerOrderRowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  tokenMint: z.string(),
  orderUuid: z.string(),
  payerWallet: z.string(),
  priceUsdc: z.string(),
  payWithSol: z.boolean(),
  status: z.enum(["pending", "broadcast", "paid", "failed", "stub_paid"]),
  stub: z.boolean(),
  paymentSignature: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  paidAt: z.date().nullable(),
});
export type DexscreenerOrderRow = z.infer<typeof DexscreenerOrderRowSchema>;
