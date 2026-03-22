import { redis } from "./redis";

/**
 * 캐시 키를 생성한다
 * @example getCacheKey("celeb", "123", "sentiment") → "celeb:123:sentiment"
 */
export function getCacheKey(...parts: string[]): string {
  return parts.join(":");
}

/**
 * JSON 캐시 결과를 파싱한다. 실패 시 null 반환
 */
export function parseCacheResult<T = unknown>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Redis 캐시를 확인하고, 미스 시 fetcher를 호출하여 결과를 캐싱한다
 */
export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await redis.get(key);
  const parsed = parseCacheResult<T>(cached);
  if (parsed !== null) return parsed;

  const fresh = await fetcher();
  await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  return fresh;
}

/**
 * 지정된 캐시 키를 삭제한다
 */
export async function invalidateCache(...keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}
