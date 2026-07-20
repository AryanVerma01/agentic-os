import { createClient } from "redis"

export const redis = createClient({
    url: process.env.REDIS_URL
})

redis.on("error", (err) => { console.error("Redis Client Error", err) })

// Lue script for Atomic sliding window rate Limiting

const SLIDING_WINDOW_LUA = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local clearBefore = now - window

    redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
    local count = redis.call('ZCARD', key)

    if count < limit then
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, math.ceil(window / 1000))
        return 1
    else
        return 0
    end
`
export async function checkRateLimit(
    identifier: string,
    limit: number,
    windowMs: number
) {
    const now = Date.now();
    const result = await redis.eval(SLIDING_WINDOW_LUA, {
        keys: [`ratelimit:${identifier}`],
        arguments: [now.toString(), windowMs.toString(), limit.toString()]
    });

    return result === 1
}