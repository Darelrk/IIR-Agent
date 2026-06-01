import { Redis } from '@upstash/redis'
import { CACHE, RATE_LIMIT } from '~/config'

let _client: Redis | null = null

export function getRedis(): Redis {
  if (!_client) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN harus di-set')
    }
    _client = new Redis({ url, token })
  }
  return _client
}

// =====================
// URL Embedding Cache
// =====================

function cacheKey(url: string): string {
  return `url:${Buffer.from(url).toString('base64url')}`
}

export interface CachedUrlData {
  url: string
  title: string
  chunks: number
  fetchedAt: string
}

export async function getCachedUrl(url: string): Promise<CachedUrlData | null> {
  const redis = getRedis()
  return redis.get<CachedUrlData>(cacheKey(url))
}

export async function setCachedUrl(
  url: string,
  data: CachedUrlData,
  ttlSeconds = CACHE.URL_TTL_SECONDS,
): Promise<void> {
  const redis = getRedis()
  await redis.set(cacheKey(url), data, { ex: ttlSeconds })
}

export async function deleteCachedUrl(url: string): Promise<void> {
  const redis = getRedis()
  await redis.del(cacheKey(url))
}

// =====================
// Rate Limiting (sliding window via sorted set)
// =====================

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number
}

/**
 * Sliding-window rate limit. Counts existing entries before adding the new one,
 * so rejected requests do not consume quota.
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests = RATE_LIMIT.MAX_REQUESTS,
  windowSeconds = RATE_LIMIT.WINDOW_SECONDS,
): Promise<RateLimitResult> {
  const redis = getRedis()
  const key = `ratelimit:${identifier}`
  const now = Date.now()
  const windowStart = now - windowSeconds * 1000

  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, windowStart)
  pipe.zcard(key)
  pipe.expire(key, windowSeconds)

  const results = await pipe.exec()
  const count = (results[1] as number) || 0

  if (count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: windowSeconds }
  }

  // Allowed: record this request
  await redis.zadd(key, { score: now, member: `${now}` })
  await redis.expire(key, windowSeconds)

  return {
    allowed: true,
    remaining: maxRequests - count - 1,
    resetIn: windowSeconds,
  }
}
