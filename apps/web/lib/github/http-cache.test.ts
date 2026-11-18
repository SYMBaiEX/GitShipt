import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { fetchGitHubJsonWithEtag } from "./http-cache";

const cache = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/read-through-cache", () => ({
  getReadThroughPayload: cache.get,
  setReadThroughPayload: cache.set,
}));

afterEach(() => vi.unstubAllGlobals());

it("renews the fresh window when GitHub returns an unchanged ETag", async () => {
  cache.get.mockResolvedValue({
    etag: '"revision"',
    data: { stars: 5 },
    freshUntil: 1,
  });
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
  vi.stubGlobal("fetch", fetch);
  const endpoint = "https://api.github.com/repos/example/repo";
  const startedAt = Date.now();
  await expect(
    fetchGitHubJsonWithEtag("repo", endpoint, z.object({ stars: z.number() }), {
      ttlSeconds: 300,
      timeoutMs: 1_500,
    }),
  ).resolves.toEqual({ stars: 5 });
  expect(fetch.mock.calls[0]?.[1]?.headers.get("if-none-match")).toBe(
    '"revision"',
  );
  const [key, payload, ttl] = cache.set.mock.calls[0] ?? [];
  expect(key).toBe("github:repo");
  expect(payload.freshUntil).toBeGreaterThanOrEqual(startedAt + 300_000);
  expect(ttl).toBe(1_200);
});
