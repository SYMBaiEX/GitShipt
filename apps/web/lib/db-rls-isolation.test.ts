import { expect, it, vi } from "vitest";
import "@/db/rls-storage-init";
import { getRlsContext } from "@/db/rls-context";
import { withDbServiceContext, withUserDb } from "./db-rls";

vi.mock("server-only", () => ({}));

it("keeps service and user queries isolated in parallel", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = withDbServiceContext("test", async () => {
    await gate;
    expect(getRlsContext().mode).toBe("service");
  });
  try {
    await withUserDb("fixture-user", "test", async () => {
      await Promise.resolve();
      expect(getRlsContext()).toMatchObject({
        mode: "user",
        userId: "fixture-user",
      });
    });
    expect(getRlsContext().mode).toBe("anon");
  } finally {
    release();
    await service;
  }
});

it("runs lazy database thenables inside the authenticated scope", async () => {
  const query: PromiseLike<ReturnType<typeof getRlsContext>> = {
    then: (resolve, reject) =>
      Promise.resolve().then(getRlsContext).then(resolve, reject),
  };
  expect(await withUserDb("fixture-user", "test", () => query)).toMatchObject({
    mode: "user",
    userId: "fixture-user",
  });
  expect(getRlsContext().mode).toBe("anon");
});
