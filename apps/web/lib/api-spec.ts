import { z } from "zod";

import {
  ApiErrorResponseSchema,
  MfaEnrollResponseSchema,
  MfaVerifyResponseSchema,
  ProjectLeaderboardResponseSchema,
  WalletNonceRequestSchema,
  WalletNonceResponseSchema,
  WalletVerifyResponseSchema,
} from "@repo/shared";

/**
 * OpenAPI 3.1 spec for the public HTTP surface. Generated from Zod schemas
 * via `z.toJSONSchema` so the spec stays in lockstep with the runtime
 * validators — no hand-written shape duplication.
 *
 * This is intentionally a curated surface, not an exhaustive route dump.
 * Webhook handlers, CSP report endpoints, and cron handlers aren't part of
 * the consumer-facing contract and are documented in RUNBOOK.md.
 *
 * Mounted at `/api/openapi.json`. Tooling like Stoplight Elements, Swagger
 * UI, and `openapi-typescript` consume the JSON directly.
 */

// z.toJSONSchema's runtime payload is a JSON-Schema-shaped object
// ($schema/type/properties/...). Its TypeScript type signature is a typed
// payload wrapper that doesn't match the runtime shape, so we treat it as
// an opaque JSON document at the API-spec layer.
type JsonSchema = Record<string, unknown>;

function schema(s: z.ZodType): JsonSchema {
  return z.toJSONSchema(s, {
    target: "draft-2020-12",
  }) as unknown as JsonSchema;
}

const ErrorResponse = schema(ApiErrorResponseSchema);
const NOT_AUTHENTICATED = {
  description: "Missing or invalid better-auth session.",
  content: { "application/json": { schema: ErrorResponse } },
} as const;

const RATE_LIMITED = {
  description: "Per-user/IP rate limit exceeded.",
  content: { "application/json": { schema: ErrorResponse } },
} as const;

const INVALID_BODY = {
  description: "Zod validation failed; `details` carries the flattened issues.",
  content: { "application/json": { schema: ErrorResponse } },
} as const;

export interface OpenApiSpec {
  openapi: "3.1.0";
  info: Record<string, unknown>;
  servers: { url: string; description?: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, JsonSchema> };
}

export function buildOpenApiSpec(appUrl: string): OpenApiSpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "GitShipt HTTP API",
      version: "0.1.0",
      description:
        "GitShipt's public HTTP surface. Authenticated routes use a better-auth session cookie or, where noted, a project-scoped API key (`Authorization: Bearer gitshipt_pk_…`). All mutating routes require an `Idempotency-Key` header in the format `[A-Za-z0-9_\\-:.]{8,128}`. Money-flow endpoints are rate-limited (see RUNBOOK.md).",
      license: { name: "MIT", url: "https://opensource.org/license/mit" },
      contact: { email: "security@gitshipt.com" },
    },
    servers: [
      { url: appUrl, description: "Configured deployment" },
      { url: "https://gitshipt.com", description: "Production" },
    ],
    components: {
      schemas: {
        ApiErrorResponse: ErrorResponse,
        WalletNonceRequest: schema(WalletNonceRequestSchema),
        WalletNonceResponse: schema(WalletNonceResponseSchema),
        WalletVerifyResponse: schema(WalletVerifyResponseSchema),
        ProjectLeaderboardResponse: schema(ProjectLeaderboardResponseSchema),
        MfaEnrollResponse: schema(MfaEnrollResponseSchema),
        MfaVerifyResponse: schema(MfaVerifyResponseSchema),
      },
    },
    paths: {
      "/api/health": {
        get: {
          summary: "Service health probe",
          description:
            "Lightweight readiness check. Returns DB / Redis / Bags / Solana sub-statuses, productionReadiness diagnostics, and the override flags from the running env.",
          responses: {
            "200": {
              description: "Health snapshot.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      status: { type: "object", additionalProperties: true },
                      production: {
                        type: "object",
                        additionalProperties: true,
                      },
                      overrides: { type: "object", additionalProperties: true },
                      stubMode: { type: "object", additionalProperties: true },
                      at: { type: "string", format: "date-time" },
                    },
                    required: ["ok", "status", "production", "at"],
                  },
                },
              },
            },
          },
        },
      },

      "/api/wallets/nonce": {
        post: {
          summary: "Mint a SIWS nonce for wallet linking",
          description:
            "Allocates a single-use, Redis-backed nonce bound to the requesting session and address. Required before signing the SIWS challenge in `/api/wallets/verify`.",
          security: [{ session: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WalletNonceRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Nonce allocated. Single-use, 5-minute TTL.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WalletNonceResponse" },
                },
              },
            },
            "400": INVALID_BODY,
            "401": NOT_AUTHENTICATED,
            "429": RATE_LIMITED,
          },
        },
      },

      "/api/wallets/verify": {
        post: {
          summary: "Bind a SIWS-verified wallet to the current account",
          description:
            "Verifies the SIWS signature against the previously-issued nonce and links the wallet under (userId, address). When the user has MFA enrolled, a fresh TOTP confirmation (≤5 min) is required.",
          security: [{ session: [] }],
          parameters: [
            {
              in: "header",
              name: "Idempotency-Key",
              required: false,
              schema: { type: "string", pattern: "^[A-Za-z0-9_\\-:.]{8,128}$" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message", "signature"],
                  properties: {
                    message: { type: "object", additionalProperties: true },
                    signature: {
                      type: "string",
                      description: "Base58 SIWS signature.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Wallet linked.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WalletVerifyResponse" },
                },
              },
            },
            "400": INVALID_BODY,
            "401": {
              description:
                "Unauthenticated, or `mfa_required` when the user has MFA enrolled but no fresh confirmation.",
              content: { "application/json": { schema: ErrorResponse } },
            },
            "429": RATE_LIMITED,
            "503": {
              description: "DB not configured (stub mode).",
              content: { "application/json": { schema: ErrorResponse } },
            },
          },
        },
      },

      "/api/projects": {
        post: {
          summary: "Create a project draft",
          description:
            "Creates a `draft` project linked to a GitHub repo the caller owns. Requires `Idempotency-Key`. Per-user rate limit: 30/hour.",
          security: [{ session: [] }],
          parameters: [
            {
              in: "header",
              name: "Idempotency-Key",
              required: true,
              schema: { type: "string", pattern: "^[A-Za-z0-9_\\-:.]{8,128}$" },
            },
          ],
          responses: {
            "200": { description: "Project created." },
            "400": INVALID_BODY,
            "401": NOT_AUTHENTICATED,
            "403": {
              description: "Permission denied (not a repo owner, etc).",
              content: { "application/json": { schema: ErrorResponse } },
            },
            "429": RATE_LIMITED,
          },
        },
      },

      "/api/projects/{id}/leaderboard": {
        get: {
          summary: "Project contributor leaderboard",
          description:
            "Latest snapshot leaderboard for the project, ranked by score.",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Ranked contributors and pool size.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ProjectLeaderboardResponse",
                  },
                },
              },
            },
            "404": { description: "Project not found." },
          },
        },
      },

      "/api/projects/{id}/launch": {
        post: {
          summary: "Launch a configured project on Bags",
          description:
            "Idempotent. Per-user/project rate limit: 12/min. Returns the token mint and Bags fee-share config key on success. Stub mode and real launches share separate idempotency namespaces.",
          security: [{ session: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
            {
              in: "header",
              name: "Idempotency-Key",
              required: false,
              schema: { type: "string", pattern: "^[A-Za-z0-9_\\-:.]{8,128}$" },
            },
          ],
          responses: {
            "200": { description: "Launched." },
            "400": INVALID_BODY,
            "401": NOT_AUTHENTICATED,
            "403": { description: "Permission denied." },
            "429": RATE_LIMITED,
            "503": {
              description:
                "Stub credentials missing in production with `ALLOW_STUBS_IN_PROD=false`.",
            },
          },
        },
      },

      "/api/projects/{id}/transfer": {
        post: {
          summary: "Transfer project ownership",
          description:
            'Destructive admin action: requires `requirePermission("project.transfer")`, a typed-name confirmation, a fresh MFA, and a min-20-char reason recorded to the audit log. Per-user/project rate limit: 12/min.',
          security: [{ session: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
            {
              in: "header",
              name: "Idempotency-Key",
              required: false,
              schema: { type: "string", pattern: "^[A-Za-z0-9_\\-:.]{8,128}$" },
            },
          ],
          responses: {
            "200": { description: "Transfer complete." },
            "400": INVALID_BODY,
            "401": NOT_AUTHENTICATED,
            "403": {
              description:
                "Permission denied or destructive-action gate failed (`mfa_required`, `mfa_expired`, `confirmation_mismatch`, `reason_too_short`).",
            },
            "429": RATE_LIMITED,
          },
        },
      },

      "/api/auth/mfa/enroll": {
        post: {
          summary: "Enroll TOTP MFA",
          description:
            "Returns a base32 secret and provisioning URI to render as a QR code. Caller must follow up with `/api/auth/mfa/verify` to confirm the code.",
          security: [{ session: [] }],
          responses: {
            "200": {
              description: "Enrollment artifact issued.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MfaEnrollResponse" },
                },
              },
            },
            "401": NOT_AUTHENTICATED,
          },
        },
      },

      "/api/auth/mfa/verify": {
        post: {
          summary: "Verify TOTP MFA code",
          description:
            "Confirms a fresh 6-digit TOTP and writes a 5-minute confirmation key to Redis. The destructive-action gate reads that key.",
          security: [{ session: [] }],
          responses: {
            "200": {
              description: "Verified.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MfaVerifyResponse" },
                },
              },
            },
            "400": INVALID_BODY,
            "401": NOT_AUTHENTICATED,
          },
        },
      },
    },
  };
}
