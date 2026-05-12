import "server-only";
import * as OTPAuth from "otpauth";
import { redis } from "@/lib/redis";
import { serverEnv } from "@/lib/env";

const webcrypto = globalThis.crypto;

/**
 * MFA helpers (TOTP via `otpauth`).
 *
 * Token format: 6 digits, SHA1, 30s period — matches Google Authenticator,
 * 1Password, Authy, etc.
 *
 * Encrypted-secret blob format (returned by encryptSecret, consumed by
 * decryptSecret):
 *
 *     "<base64url(iv 12 bytes)>.<base64url(ciphertext+tag)>"
 *
 * AES-GCM-256 with the key derived via SHA-256 from `BETTER_AUTH_SECRET`.
 *
 * Confirmed-MFA cache: a Redis key `mfa:confirmed:${userId}` with a unix-ms
 * timestamp value and a 600s TTL. The destructive-action gate enforces a
 * 5-minute freshness window inside that TTL.
 */

const ISSUER = "GitShipt";
const TOTP_ALGORITHM = "SHA1";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_WINDOW = 1; // accept current step ±1 to absorb clock skew

const REDIS_KEY_PREFIX = "mfa:confirmed:";
// Aligned with the destructive-action and wallet-link freshness windows
// (5 min). The Redis TTL is the hard ceiling — a confirmation that has
// already aged past this is not just rejected by the application check,
// it is gone from Redis entirely. Keeping the TTL longer than the
// application window only widened the attacker's reuse opportunity if
// they could bypass the in-process check.
const REDIS_TTL_SECONDS = 300;

export interface GeneratedSecret {
  /** Base32-encoded shared secret (for manual-entry display + storage). */
  secretBase32: string;
  /** Provisioning URI for QR codes (otpauth://). */
  uri: string;
}

let _keyCache: CryptoKey | null = null;

async function deriveKey(): Promise<CryptoKey> {
  if (_keyCache) return _keyCache;
  const env = serverEnv();
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET is required (>=32 chars) to encrypt MFA secrets.",
    );
  }
  const raw = new TextEncoder().encode(secret);
  const hash = await webcrypto.subtle.digest("SHA-256", raw);
  _keyCache = await webcrypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return _keyCache;
}

function toB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64Url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Generate a fresh TOTP secret + provisioning URI.
 * The label embeds the user identifier (typically email or username) so
 * the entry shows up correctly in authenticator apps.
 */
export function generateSecret(label: string): GeneratedSecret {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
  return {
    secretBase32: totp.secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Validate a 6-digit TOTP code against a base32 secret.
 */
export function verifyTotp(secretBase32: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const delta = OTPAuth.TOTP.validate({
      token,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      window: TOTP_WINDOW,
    });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Encrypt a base32 secret with AES-GCM. Returns the wire format described
 * in the file header: `${iv}.${ciphertext}` (both base64url).
 */
export async function encryptSecret(secretBase32: string): Promise<string> {
  const key = await deriveKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(secretBase32);
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return `${toB64Url(iv)}.${toB64Url(new Uint8Array(ct))}`;
}

/**
 * Decrypt a blob in the `${iv}.${ciphertext}` format. Throws on malformed
 * input or auth-tag failure.
 */
export async function decryptSecret(blob: string): Promise<string> {
  const parts = blob.split(".");
  if (parts.length !== 2) {
    throw new Error("Malformed MFA blob: expected `${iv}.${ciphertext}`.");
  }
  const [ivB64, ctB64] = parts as [string, string];
  const key = await deriveKey();
  const iv = fromB64Url(ivB64);
  const ct = fromB64Url(ctB64);
  const pt = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ct,
  );
  return new TextDecoder().decode(pt);
}

/**
 * Mark MFA as freshly confirmed for a user. Stores `Date.now()` (unix-ms)
 * with a 10-minute TTL.
 */
export async function markMfaConfirmed(userId: string): Promise<number> {
  const r = redis();
  const ts = Date.now();
  if (!r) return ts; // dev / stubbed mode: caller still gets a timestamp
  await r.set(
    `${REDIS_KEY_PREFIX}${userId}`,
    String(ts),
    "EX",
    REDIS_TTL_SECONDS,
  );
  return ts;
}

/**
 * Read the last MFA confirmation timestamp for a user. Returns `null` if
 * no entry exists, the entry expired, or Redis is unavailable.
 */
export async function getMfaConfirmedAt(
  userId: string,
): Promise<number | null> {
  const r = redis();
  if (!r) return null;
  const v = await r.get(`${REDIS_KEY_PREFIX}${userId}`);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Clear the MFA confirmation cache for a user (used on revoke).
 */
export async function clearMfaConfirmed(userId: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.del(`${REDIS_KEY_PREFIX}${userId}`);
}
