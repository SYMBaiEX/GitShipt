import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rows: [] as Array<{ value: unknown }> }));
vi.mock("@/db", () => ({
  dbHttp: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            then: (
              fulfilled: (rows: Array<{ value: unknown }>) => unknown,
              rejected: (reason: unknown) => unknown,
            ) =>
              import("@/db/rls-context")
                .then(({ getRlsContext }) => {
                  expect(getRlsContext()).toMatchObject({
                    mode: "service",
                    reason: "launch-platform-fee",
                  });
                  return state.rows;
                })
                .then(fulfilled, rejected),
          }),
        }),
      }),
    }),
  },
}));
import { withRlsContext, getRlsContext } from "@/db/rls-context";
import { platformFeeBps } from "./platform-fee";

beforeEach(() => {
  state.rows = [];
});
describe("effective platform fee", () => {
  it("reads the admin setting as a non-admin without leaking service context", async () => {
    state.rows = [{ value: { value: 1750 } }];
    await withRlsContext(
      { mode: "user", userId: "launcher", role: "user" },
      async () => {
        expect(await platformFeeBps()).toBe(1750);
        expect(getRlsContext()).toMatchObject({
          mode: "user",
          userId: "launcher",
        });
      },
    );
  });
  it("defaults only when the setting is absent, not when it is zero", async () => {
    expect(await platformFeeBps()).toBe(1000);
    state.rows = [{ value: { value: 0 } }];
    expect(await platformFeeBps()).toBe(0);
  });
  it("fails closed on corrupt stored configuration", async () => {
    state.rows = [{ value: { value: -1 } }];
    await expect(platformFeeBps()).rejects.toThrow();
  });
});
