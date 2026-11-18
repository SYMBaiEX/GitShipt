import { z } from "zod";
import {
  getReadThroughPayload,
  setReadThroughPayload,
} from "@/lib/read-through-cache";

interface GitHubCachedJson<T> {
  etag: string | null;
  data: T;
  freshUntil: number;
}

export async function fetchGitHubJsonWithEtag<TSchema extends z.ZodType>(
  key: string,
  url: string,
  schema: TSchema,
  options: { ttlSeconds: number; headers?: HeadersInit; timeoutMs?: number },
): Promise<z.infer<TSchema>> {
  const cacheKey = `github:${key}`;
  const cached =
    await getReadThroughPayload<GitHubCachedJson<z.infer<TSchema>>>(cacheKey);
  if (cached && cached.freshUntil > Date.now()) return cached.data;

  const headers = new Headers(options.headers);
  headers.set("accept", "application/vnd.github+json");
  headers.set("x-github-api-version", "2022-11-28");
  if (cached?.etag) headers.set("if-none-match", cached.etag);

  try {
    const res = await fetch(url, {
      headers,
      signal: options.timeoutMs
        ? AbortSignal.timeout(options.timeoutMs)
        : undefined,
    });
    if (res.status === 304 && cached) {
      await setReadThroughPayload(
        cacheKey,
        { ...cached, freshUntil: Date.now() + options.ttlSeconds * 1000 },
        options.ttlSeconds * 4,
      );
      return cached.data;
    }
    if (!res.ok) throw new Error(`GitHub ${res.status} ${res.statusText}`);

    const data = schema.parse(await res.json());
    await setReadThroughPayload(
      cacheKey,
      {
        etag: res.headers.get("etag"),
        data,
        freshUntil: Date.now() + options.ttlSeconds * 1000,
      },
      options.ttlSeconds * 4,
    );
    return data;
  } catch (error) {
    if (cached) return cached.data;
    throw error;
  }
}
