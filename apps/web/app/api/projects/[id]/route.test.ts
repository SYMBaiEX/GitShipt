import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ mode: undefined as "owner" | "contributors" | undefined, updates: null as Record<string, unknown> | null, predicate: null as unknown, rows: [{ id: "project" }] }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: () => ({ api: { getSession: async () => ({ user: { id: "user" } }) } }) }));
vi.mock("@/db", () => ({ dbHttp: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "project", status: "draft", ghOwner: "owner", ghRepo: "repo", payoutConfig: { rewardMode: state.mode } }] }) }) }),
  update: () => ({ set: (updates: Record<string, unknown>) => { state.updates = updates; return { where: (predicate: unknown) => { state.predicate = predicate; return { returning: async () => state.rows }; } }; } }),
} }));
vi.mock("@/lib/env", () => ({ hasCredentials: { db: () => true } }));
vi.mock("@/lib/rate-limit", () => ({ check: async () => ({ success: true }) }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: async () => undefined, PermissionError: class extends Error {} }));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: async (_key: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/cache", () => ({ revalidateProjectCaches: async () => undefined }));

const config = { topN: 3, tierWeights: [0.5, 0.3, 0.2], claimThresholdLamports: 0 };
async function patch(payoutConfig: typeof config & { rewardMode?: "owner" | "contributors" }) {
  const { PATCH } = await import("./route");
  return PATCH(new Request("https://example.test/api/projects/project", { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": "test-key" }, body: JSON.stringify({ payoutConfig }) }), { params: Promise.resolve({ id: "project" }) });
}

describe("draft payout mode PATCH", () => {
  beforeEach(() => { state.mode = undefined; state.updates = null; state.predicate = null; state.rows = [{ id: "project" }]; });
  it("preserves the stored owner mode when omitted by an older client", async () => {
    state.mode = "owner";
    expect((await patch(config)).status).toBe(200);
    expect(state.updates?.payoutConfig).toMatchObject({ rewardMode: "owner" });
  });
  it("preserves missing legacy mode and allows an explicit reviewed conversion", async () => {
    expect((await patch(config)).status).toBe(200);
    expect((state.updates?.payoutConfig as { rewardMode?: string }).rewardMode).toBeUndefined();
    expect((await patch({ ...config, rewardMode: "owner" })).status).toBe(200);
    expect(state.updates?.payoutConfig).toMatchObject({ rewardMode: "owner" });
  });
  it("guards both status and previously observed reward mode against races", async () => {
    state.mode = "owner";
    state.rows = [];
    expect((await patch(config)).status).toBe(409);
    const query = new PgDialect().sqlToQuery(state.predicate as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.sql).toContain("rewardMode");
    expect(query.params).toContain("draft");
    expect(query.params).toContain("owner");
  });
});
