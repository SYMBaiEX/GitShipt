import { describe, expect, it } from "vitest";

import { buildOpenApiSpec } from "./api-spec";

describe("buildOpenApiSpec", () => {
  const spec = buildOpenApiSpec("https://gitshipt.example");

  it("emits OpenAPI 3.1.0 with required top-level fields", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info).toBeDefined();
    expect((spec.info as { title?: string }).title).toMatch(/GitShipt/);
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.components).toBeDefined();
    expect(spec.components.schemas).toBeDefined();
  });

  it("documents the consumer-facing route surface", () => {
    const required = [
      "/api/health",
      "/api/wallets/nonce",
      "/api/wallets/verify",
      "/api/projects",
      "/api/projects/{id}/leaderboard",
      "/api/projects/{id}/launch",
      "/api/projects/{id}/transfer",
      "/api/auth/mfa/enroll",
      "/api/auth/mfa/verify",
    ];
    for (const path of required) {
      expect(spec.paths[path], `missing ${path}`).toBeDefined();
    }
  });

  it("registers the shared component schemas under components/schemas", () => {
    const keys = Object.keys(spec.components.schemas);
    expect(keys).toContain("ApiErrorResponse");
    expect(keys).toContain("WalletNonceRequest");
    expect(keys).toContain("WalletNonceResponse");
    expect(keys).toContain("WalletVerifyResponse");
    expect(keys).toContain("MfaEnrollResponse");
    expect(keys).toContain("MfaVerifyResponse");
  });

  it("paths reference at least one shared component via $ref", () => {
    const json = JSON.stringify(spec);
    expect(json).toContain("#/components/schemas/");
  });

  it("every operation declares a 200/2xx response", () => {
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(
        ops as Record<string, unknown>,
      )) {
        const responses = (op as { responses?: Record<string, unknown> })
          .responses;
        expect(responses, `${method} ${path} has no responses`).toBeDefined();
        const codes = Object.keys(responses ?? {});
        expect(
          codes.some((c) => c.startsWith("2")),
          `${method} ${path} has no 2xx response`,
        ).toBe(true);
      }
    }
  });

  it("rate-limited routes document a 429", () => {
    const limited = [
      "/api/wallets/nonce",
      "/api/projects",
      "/api/projects/{id}/launch",
      "/api/projects/{id}/transfer",
    ];
    for (const path of limited) {
      const responses = (
        (spec.paths[path] as Record<string, unknown>)["post"] as {
          responses: Record<string, unknown>;
        }
      ).responses;
      expect(responses["429"], `${path} missing 429`).toBeDefined();
    }
  });
});
