import { redis } from "@/lib/redis";
import type { Redis as IORedisClient } from "ioredis";

type CachePayload =
  | null
  | boolean
  | number
  | string
  | CachePayload[]
  | { [key: string]: CachePayload };

const CACHE_TYPE_KEY = "__gitshipt_cache_type";
const CACHE_VALUE_KEY = "value";
const CACHE_IO_BUDGET_MS = 150;
const pendingReads = new Map<string, Promise<unknown>>();

export interface ReadThroughCacheOptions<T> {
  key: string;
  ttlSeconds: number;
  loader: () => Promise<T>;
}

export async function readThroughCache<T>(
  options: ReadThroughCacheOptions<T>,
): Promise<T> {
  const pending = pendingReads.get(options.key);
  // Callers use an endpoint-specific cache key with a single payload type.
  if (pending) return pending as Promise<T>;
  const request = (async () => {
    const cached = await getReadThroughPayload<T>(options.key);
    if (cached !== null) return cached;
    const value = await options.loader();
    await setReadThroughPayload(options.key, value, options.ttlSeconds);
    return value;
  })().finally(() => pendingReads.delete(options.key));
  pendingReads.set(options.key, request);
  return request;
}

export async function getReadThroughPayload<T>(key: string): Promise<T | null> {
  const r = safeRedis();
  if (!r) return null;
  try {
    const cached = await withinCacheBudget(
      r.get(`gitshipt:read-through:${key}`),
    );
    return cached
      ? fromCachePayload<T>(JSON.parse(cached) as CachePayload)
      : null;
  } catch {
    // An optional cache read must not mask an available origin.
    return null;
  }
}

export async function setReadThroughPayload<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const r = safeRedis();
  if (!r) return;
  try {
    await withinCacheBudget(
      r.set(
        `gitshipt:read-through:${key}`,
        JSON.stringify(toCachePayload(value)),
        "EX",
        Math.max(1, ttlSeconds),
      ),
    );
  } catch {
    // The caller already has a valid response from the origin.
  }
}

function safeRedis(): IORedisClient | null {
  try {
    return redis();
  } catch {
    return null;
  }
}

async function withinCacheBudget<T>(request: Promise<T>): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), CACHE_IO_BUDGET_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function toCachePayload(value: unknown): CachePayload {
  if (value == null) return null;
  if (typeof value === "bigint") {
    return {
      [CACHE_TYPE_KEY]: "bigint",
      [CACHE_VALUE_KEY]: value.toString(),
    };
  }
  if (value instanceof Date) {
    return {
      [CACHE_TYPE_KEY]: "date",
      [CACHE_VALUE_KEY]: value.toISOString(),
    };
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toCachePayload(item));
  }
  if (typeof value === "object") {
    const out: { [key: string]: CachePayload } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      out[key] = toCachePayload(item);
    }
    return out;
  }
  throw new TypeError(`Unsupported cache payload value: ${typeof value}`);
}

function fromCachePayload<T>(payload: CachePayload): T {
  return reviveCachePayload(payload) as T;
}

function reviveCachePayload(payload: CachePayload): unknown {
  if (payload == null) return null;
  if (Array.isArray(payload)) {
    return payload.map((item) => reviveCachePayload(item));
  }
  if (typeof payload !== "object") return payload;

  const type = payload[CACHE_TYPE_KEY];
  const value = payload[CACHE_VALUE_KEY];
  if (type === "bigint" && typeof value === "string") return BigInt(value);
  if (type === "date" && typeof value === "string") return new Date(value);

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(payload)) {
    out[key] = reviveCachePayload(item);
  }
  return out;
}
