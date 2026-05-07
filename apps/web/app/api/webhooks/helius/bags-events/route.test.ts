import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_AUTH_TOKEN = "test-helius-token-1234567890";

interface ConfigRow {
  id: string;
  pda: string;
}
interface SlotRow {
  configId: string;
  slotIndex: number;
  contributorId: string | null;
}
interface ClaimEventInsertRow {
  feeShareConfigId: string;
  txSignature: string;
  logIndex: number;
  userPubkey: string;
  claimerIndex: number | null;
  lamports: bigint;
  contributorId: string | null;
  kind: "user_claim_v2" | "user_vault_claim";
  ingestSource: "webhook" | "polling" | "backfill";
}

function installEnvMocks(authToken?: string | null) {
  const env = {
    NODE_ENV: "test",
    HELIUS_WEBHOOK_AUTH_TOKEN:
      authToken === null ? undefined : authToken ?? TEST_AUTH_TOKEN,
  };
  vi.doMock("@/lib/env", () => ({
    serverEnv: () => env,
    hasCredentials: {
      heliusWebhook: () => Boolean(env.HELIUS_WEBHOOK_AUTH_TOKEN),
    },
  }));
}

function installAuditMock() {
  const audit = vi.fn();
  vi.doMock("@/lib/audit", () => ({ audit }));
  return audit;
}

function installObservabilityMock() {
  const captureException = vi.fn();
  vi.doMock("@/lib/observability", () => ({ captureException }));
  return captureException;
}

function installRlsMock() {
  vi.doMock("@/lib/db-rls", () => ({
    enterDbServiceContext: vi.fn(),
  }));
}

interface DbState {
  configs: ConfigRow[];
  slots: SlotRow[];
  insertedClaims: ClaimEventInsertRow[];
}

function installDbMock(state: DbState) {
  // Minimal chainable mock for: db.select(...).from(...).where(...).
  // Different chains return different fixtures based on the table referenced.

  const fromConfigs = () => ({
    where: () => Promise.resolve(state.configs),
  });
  const fromSlots = () => ({
    where: () => Promise.resolve(state.slots),
  });

  const select = () => ({
    from: (table: unknown) => {
      const tableName = String((table as { _?: { name: string } })._?.name);
      if (tableName === "bags_fee_share_configs") return fromConfigs();
      if (tableName === "bags_claimer_slots") return fromSlots();
      throw new Error(`unexpected select-from table: ${tableName}`);
    },
  });

  const insert = (table: unknown) => {
    const tableName = String((table as { _?: { name: string } })._?.name);
    if (tableName !== "bags_claim_events") {
      throw new Error(`unexpected insert table: ${tableName}`);
    }
    return {
      values: (rows: ClaimEventInsertRow[]) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            // Simulate UNIQUE(tx_signature, log_index): drop dupes.
            const seen = new Set(
              state.insertedClaims.map(
                (r) => `${r.txSignature}:${r.logIndex}`,
              ),
            );
            const fresh = rows.filter(
              (r) => !seen.has(`${r.txSignature}:${r.logIndex}`),
            );
            for (const row of fresh) {
              state.insertedClaims.push(row);
            }
            return fresh.map((_, i) => ({ id: `evt_${state.insertedClaims.length - fresh.length + i}` }));
          },
        }),
      }),
    };
  };

  vi.doMock("@/db", () => ({
    dbHttp: { select, insert },
  }));
}

function installEventParserMock(events: Array<{ type: string; data: unknown }>) {
  vi.doMock("@/lib/bags/program-events", () => ({
    parseBagsProgramEvents: vi.fn().mockReturnValue(events),
  }));
}

function makeRequest(payload: unknown, authHeader?: string): Request {
  return new Request("http://localhost/api/webhooks/helius/bags-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/webhooks/helius/bags-events", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when no auth header is provided", async () => {
    installEnvMocks();
    installAuditMock();
    installObservabilityMock();
    installRlsMock();
    installDbMock({ configs: [], slots: [], insertedClaims: [] });
    installEventParserMock([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest([], undefined));
    expect(res.status).toBe(401);
  });

  it("returns 401 when auth token is missing in env", async () => {
    installEnvMocks(null);
    installAuditMock();
    installObservabilityMock();
    installRlsMock();
    installDbMock({ configs: [], slots: [], insertedClaims: [] });
    installEventParserMock([]);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest([], `Bearer ${TEST_AUTH_TOKEN}`),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when auth token does not match", async () => {
    installEnvMocks();
    installAuditMock();
    installObservabilityMock();
    installRlsMock();
    installDbMock({ configs: [], slots: [], insertedClaims: [] });
    installEventParserMock([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest([], "Bearer wrong-token"));
    expect(res.status).toBe(401);
  });

  it("accepts plain token (without 'Bearer ' prefix) for compatibility", async () => {
    installEnvMocks();
    installAuditMock();
    installObservabilityMock();
    installRlsMock();
    installDbMock({ configs: [], slots: [], insertedClaims: [] });
    installEventParserMock([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest([], TEST_AUTH_TOKEN));
    expect(res.status).toBe(200);
  });

  it("returns 400 for non-JSON body", async () => {
    installEnvMocks();
    installAuditMock();
    installObservabilityMock();
    installRlsMock();
    installDbMock({ configs: [], slots: [], insertedClaims: [] });
    installEventParserMock([]);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
        },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for payload that isn't an array of txs", async () => {
    installEnvMocks();
    installAuditMock();
    installObservabilityMock();
    installRlsMock();
    installDbMock({ configs: [], slots: [], insertedClaims: [] });
    installEventParserMock([]);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ not: "an array" }, `Bearer ${TEST_AUTH_TOKEN}`),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with zero counts for an empty batch", async () => {
    installEnvMocks();
    const audit = installAuditMock();
    installObservabilityMock();
    installRlsMock();
    installDbMock({ configs: [], slots: [], insertedClaims: [] });
    installEventParserMock([]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest([], `Bearer ${TEST_AUTH_TOKEN}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.txCount).toBe(0);
    expect(body.eventsParsed).toBe(0);
    expect(body.eventsInserted).toBe(0);
    // No audit on empty: avoids spamming the log.
    expect(audit).not.toHaveBeenCalled();
  });

  // Integration-shaped tests for the full ingestion path (config lookup,
  // slot resolution, insert + idempotency) require a real DB. They live
  // in the e2e suite and exercise the route against a Postgres test
  // database. Unit-testing the ingestion path with mocked Drizzle
  // chains produces brittle tests with weak signal; the auth + payload
  // validation paths above are the high-value unit-test surface.
});
