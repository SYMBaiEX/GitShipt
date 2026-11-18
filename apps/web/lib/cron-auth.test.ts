import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => {
  const fakeEnv: { CRON_SECRET?: string; NODE_ENV: string } = {
    CRON_SECRET: "x".repeat(40),
    NODE_ENV: "production",
  };
  return {
    serverEnv: () => fakeEnv,
    __setEnv: (next: Partial<typeof fakeEnv>) => Object.assign(fakeEnv, next),
  };
});

vi.mock("@/lib/db-rls", () => ({
  enterDbServiceContext: vi.fn(),
}));

import { isAuthorizedCron } from "./cron-auth";
import * as envMock from "@/lib/env";

const setEnv = (envMock as unknown as {
  __setEnv: (next: { CRON_SECRET?: string; NODE_ENV?: string }) => void;
}).__setEnv;

const buildReq = (headers: Record<string, string>) =>
  new Request("https://example.com/api/cron/whatever", { headers });

describe("isAuthorizedCron", () => {
  beforeEach(() => {
    setEnv({ CRON_SECRET: "x".repeat(40), NODE_ENV: "production" });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when no Authorization header is present", () => {
    expect(isAuthorizedCron(buildReq({}))).toBe(false);
  });

  it("rejects when Authorization is wrong length (defends against length oracle)", () => {
    expect(
      isAuthorizedCron(buildReq({ authorization: "Bearer short" })),
    ).toBe(false);
  });

  it("rejects when Authorization is wrong value at the right length", () => {
    const wrong = `Bearer ${"y".repeat(40)}`;
    expect(isAuthorizedCron(buildReq({ authorization: wrong }))).toBe(false);
  });

  it("accepts the exact secret", () => {
    const ok = `Bearer ${"x".repeat(40)}`;
    expect(isAuthorizedCron(buildReq({ authorization: ok }))).toBe(true);
  });

  it("rejects when CRON_SECRET is unset in production", () => {
    setEnv({ CRON_SECRET: undefined, NODE_ENV: "production" });
    expect(
      isAuthorizedCron(buildReq({ authorization: "Bearer anything" })),
    ).toBe(false);
  });

  it("dev fallback allows same-origin when CRON_SECRET unset", () => {
    setEnv({ CRON_SECRET: undefined, NODE_ENV: "development" });
    expect(
      isAuthorizedCron(
        buildReq({ host: "localhost:3000", origin: "http://localhost:3000" }),
      ),
    ).toBe(true);
  });

  it("dev fallback rejects cross-origin when CRON_SECRET unset", () => {
    setEnv({ CRON_SECRET: undefined, NODE_ENV: "development" });
    expect(
      isAuthorizedCron(
        buildReq({
          host: "localhost:3000",
          origin: "https://evil.example.com",
        }),
      ),
    ).toBe(false);
  });
});
