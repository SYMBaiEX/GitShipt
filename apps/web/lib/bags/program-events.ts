/**
 * Bags fee-share-v2 Anchor event parser.
 *
 * The Bags HTTP API does not publish webhooks for on-chain events. Instead
 * we subscribe to program logs (via Helius enhanced webhooks or
 * `connection.onLogs(programId)`) and parse the Anchor `emit!()`-style
 * events they contain. This module turns raw `Program data: <base64>`
 * lines into typed events for the v1.1 reconciliation surface.
 *
 * IDL is deep-imported from the Bags SDK package — the path is not part
 * of the SDK's documented public surface, but it has been stable across
 * recent versions and the inspector script (scripts/inspect-bags-program.ts)
 * exercises the same path. Re-verify after every Bags SDK upgrade.
 */

import { BorshEventCoder } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import idlJson from "@bagsfm/bags-sdk/dist/idl/fee-share-v2/idl.json";

const PROGRAM_DATA_PREFIX = "Program data: ";

let _coder: BorshEventCoder | null = null;
function getCoder(): BorshEventCoder {
  if (_coder) return _coder;
  _coder = new BorshEventCoder(idlJson as unknown as Idl);
  return _coder;
}

// Test seam: lets unit tests inject a mock decoder without depending on the
// real Borsh+IDL pipeline. Production callers must NOT touch this.
let _coderOverride: { decode: (log: string) => { name: string; data: unknown } | null } | null = null;
export function __setCoderForTests(
  coder: { decode: (log: string) => { name: string; data: unknown } | null } | null,
): void {
  _coderOverride = coder;
}

function decode(log: string): { name: string; data: unknown } | null {
  if (_coderOverride) return _coderOverride.decode(log);
  return getCoder().decode(log);
}

/** Discriminated union of v1.1-relevant fee-share-v2 events. */
export type BagsProgramEvent =
  | { type: "user_claim_v2"; data: BagsFeeShareUserClaimV2EventData }
  | { type: "user_vault_claim"; data: BagsFeeShareUserVaultClaimEventData }
  | { type: "fee_config_updated"; data: FeeConfigUpdatedEventData }
  | { type: "fee_config_snapshot_v2"; data: FeeConfigSnapshotV2EventData };

export interface BagsFeeShareUserClaimV2EventData {
  /** Unix timestamp (seconds) at emit. */
  timestamp: bigint;
  baseMint: string;
  quoteMint: string;
  /** Pubkey of the user (claimer slot owner) who claimed. */
  user: string;
  feeShareConfig: string;
  feeShareAuthority: string;
  /** Index of the claimer within the config's claimers array. */
  claimerIndex: number;
  /** Lamports transferred to the user. */
  claimed: bigint;
  /** Pubkey of the executor for force-claims; null on user-initiated claims. */
  forceClaimExecutor: string | null;
  /** Variant name (e.g. "manager", "admin") when force-claimed; null otherwise. */
  forceClaimType: string | null;
}

export interface BagsFeeShareUserVaultClaimEventData {
  timestamp: bigint;
  baseMint: string;
  quoteMint: string;
  user: string;
  /** PDA of the per-user vault that was drained. */
  userVault: string;
  /** Lamports transferred from the vault to the user. */
  claimed: bigint;
}

export interface FeeConfigUpdatedEventData {
  timestamp: bigint;
  feeShareConfig: string;
  baseMint: string;
  /** New BPS array after the update. */
  newBps: number[];
  /**
   * New claimer pubkeys after the update. Bags' on-chain program does not
   * actually allow replacing claimer pubkeys post-finalize (see
   * docs/adr/0001-bags-native-payout.md), so this should always equal the
   * pre-existing claimer set; surface mismatches as anomalies.
   */
  newClaimers: string[];
}

export interface FeeConfigSnapshotV2EventData {
  timestamp: bigint;
  feeShareConfig: string;
  baseMint: string;
  manager: string | null;
  partner: string | null;
  partnerConfig: string | null;
  claimers: string[];
  bps: number[];
}

/**
 * Parse all v1.1-relevant Bags fee-share-v2 events out of a transaction's
 * program log lines. Lines that aren't `Program data: <base64>` or that
 * decode to event types we don't track are silently skipped.
 *
 * Order is preserved (a tx may emit multiple events).
 */
export function parseBagsProgramEvents(
  logs: ReadonlyArray<string>,
): BagsProgramEvent[] {
  const events: BagsProgramEvent[] = [];
  for (const log of logs) {
    if (!log.startsWith(PROGRAM_DATA_PREFIX)) continue;
    const base64 = log.slice(PROGRAM_DATA_PREFIX.length).trim();
    let decoded: { name: string; data: unknown } | null;
    try {
      decoded = decode(base64);
    } catch {
      // BorshEventCoder throws on unknown discriminators / malformed
      // payloads; treat as skip rather than fail the whole tx ingestion.
      continue;
    }
    if (!decoded) continue;
    const normalized = normalizeEvent(decoded.name, decoded.data);
    if (normalized) events.push(normalized);
  }
  return events;
}

function normalizeEvent(name: string, data: unknown): BagsProgramEvent | null {
  switch (name) {
    case "BagsFeeShareUserClaimV2Event":
      return {
        type: "user_claim_v2",
        data: normalizeUserClaimV2(data),
      };
    case "BagsFeeShareUserVaultClaimEvent":
      return {
        type: "user_vault_claim",
        data: normalizeUserVaultClaim(data),
      };
    case "FeeConfigUpdatedEvent":
      return {
        type: "fee_config_updated",
        data: normalizeFeeConfigUpdated(data),
      };
    case "FeeConfigSnapshotEventV2":
      return {
        type: "fee_config_snapshot_v2",
        data: normalizeFeeConfigSnapshotV2(data),
      };
    default:
      return null;
  }
}

// Anchor decodes pubkeys to objects with `.toBase58()` (PublicKey instances)
// and bigint-shaped numbers to BN instances. Both surface area types are
// duck-typed here to avoid a hard dep on @solana/web3.js / bn.js.

function pkToString(value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error("expected pubkey, got null/undefined");
  }
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toBase58" in value &&
    typeof (value as { toBase58: unknown }).toBase58 === "function"
  ) {
    return (value as { toBase58: () => string }).toBase58();
  }
  throw new Error(`expected pubkey, got ${typeof value}`);
}

function pkToStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return pkToString(value);
}

function bnToBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof (value as { toString: unknown }).toString === "function"
  ) {
    return BigInt((value as { toString: () => string }).toString());
  }
  throw new Error(`expected number-like, got ${typeof value}`);
}

function expectField<T = unknown>(data: unknown, key: string): T {
  if (typeof data !== "object" || data === null) {
    throw new Error(`event payload is not an object`);
  }
  if (!(key in data)) {
    throw new Error(`event payload missing field: ${key}`);
  }
  return (data as Record<string, T>)[key] as T;
}

function variantName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length > 0) return keys[0] ?? null;
  }
  return null;
}

function normalizeUserClaimV2(data: unknown): BagsFeeShareUserClaimV2EventData {
  return {
    timestamp: bnToBigInt(expectField(data, "timestamp")),
    baseMint: pkToString(expectField(data, "baseMint")),
    quoteMint: pkToString(expectField(data, "quoteMint")),
    user: pkToString(expectField(data, "user")),
    feeShareConfig: pkToString(expectField(data, "feeShareConfig")),
    feeShareAuthority: pkToString(expectField(data, "feeShareAuthority")),
    claimerIndex: Number(expectField(data, "claimerIndex")),
    claimed: bnToBigInt(expectField(data, "claimed")),
    forceClaimExecutor: pkToStringOrNull(expectField(data, "forceClaimExecutor")),
    forceClaimType: variantName(expectField(data, "forceClaimType")),
  };
}

function normalizeUserVaultClaim(data: unknown): BagsFeeShareUserVaultClaimEventData {
  return {
    timestamp: bnToBigInt(expectField(data, "timestamp")),
    baseMint: pkToString(expectField(data, "baseMint")),
    quoteMint: pkToString(expectField(data, "quoteMint")),
    user: pkToString(expectField(data, "user")),
    userVault: pkToString(expectField(data, "userVault")),
    claimed: bnToBigInt(expectField(data, "claimed")),
  };
}

function normalizeFeeConfigUpdated(data: unknown): FeeConfigUpdatedEventData {
  const newBps = expectField<unknown[]>(data, "newBps");
  const newClaimers = expectField<unknown[]>(data, "newClaimers");
  return {
    timestamp: bnToBigInt(expectField(data, "timestamp")),
    feeShareConfig: pkToString(expectField(data, "feeShareConfig")),
    baseMint: pkToString(expectField(data, "baseMint")),
    newBps: newBps.map((bps) => Number(bps)),
    newClaimers: newClaimers.map((c) => pkToString(c)),
  };
}

function normalizeFeeConfigSnapshotV2(data: unknown): FeeConfigSnapshotV2EventData {
  const claimers = expectField<unknown[]>(data, "claimers");
  const bps = expectField<unknown[]>(data, "bps");
  return {
    timestamp: bnToBigInt(expectField(data, "timestamp")),
    feeShareConfig: pkToString(expectField(data, "feeShareConfig")),
    baseMint: pkToString(expectField(data, "baseMint")),
    manager: pkToStringOrNull(expectField(data, "manager")),
    partner: pkToStringOrNull(expectField(data, "partner")),
    partnerConfig: pkToStringOrNull(expectField(data, "partnerConfig")),
    claimers: claimers.map((c) => pkToString(c)),
    bps: bps.map((b) => Number(b)),
  };
}
