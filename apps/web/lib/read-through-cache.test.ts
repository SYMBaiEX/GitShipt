import { beforeEach, describe, expect, it, vi } from "vitest";
import { readThroughCache } from "./read-through-cache";

const cache = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/redis", () => ({ redis: () => cache }));

beforeEach(() => {
  cache.get.mockReset().mockResolvedValue(null);
  cache.set.mockReset().mockResolvedValue("OK");
});

describe("optional SDK read cache", () => {
  it("reuses a single origin read for simultaneous cache misses", async () => {
    const loader = vi.fn().mockResolvedValue({ lamports: 9007199254740993n });
    const options = { key: "fees", ttlSeconds: 60, loader };
    const values = await Promise.all([
      readThroughCache(options),
      readThroughCache(options),
    ]);
    expect(values[0]).toEqual(values[1]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
    cache.get.mockResolvedValue(cache.set.mock.calls[0]?.[1]);
    expect(await readThroughCache(options)).toEqual({
      lamports: 9007199254740993n,
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("returns the origin result when Redis cannot read or write", async () => {
    cache.get.mockRejectedValue(new Error("cache offline"));
    cache.set.mockRejectedValue(new Error("cache offline"));
    const loader = vi.fn().mockResolvedValue("origin");
    expect(
      await readThroughCache({ key: "offline", ttlSeconds: 30, loader }),
    ).toBe("origin");
  });

  it("falls through when the cache does not answer within its budget", async () => {
    vi.useFakeTimers();
    try {
      cache.get.mockReturnValue(new Promise(() => {}));
      const result = readThroughCache({
        key: "slow",
        ttlSeconds: 30,
        loader: async () => "origin",
      });
      await vi.advanceTimersByTimeAsync(150);
      await expect(result).resolves.toBe("origin");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retain a failed origin request", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream"))
      .mockResolvedValue("recovered");
    const options = { key: "retry", ttlSeconds: 30, loader };
    await expect(readThroughCache(options)).rejects.toThrow("upstream");
    expect(await readThroughCache(options)).toBe("recovered");
  });
});
