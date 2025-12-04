export const luaScripts = {
  concurrencyLock: `
    if ARGV[5] == "1" or ARGV[5] == "true" then
      return 1
    end

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    local count = redis.call('ZCARD', KEYS[1])
    if count >= tonumber(ARGV[3]) then return 0 end
    local expiry = tonumber(ARGV[1]) + tonumber(ARGV[2])
    redis.call('ZADD', KEYS[1], expiry, ARGV[4])
    return 1
  `,
  userRpdCheck: `
    if ARGV[4] == "1" or ARGV[4] == "true" then
      return 1
    end

    local current = redis.call('HGET', KEYS[1], 'used_rpd')
    if not current then current = 0 else current = tonumber(current) end
    if current + tonumber(ARGV[1]) > tonumber(ARGV[2]) then return 0 end
    redis.call('HINCRBY', KEYS[1], 'used_rpd', ARGV[1])
    redis.call('HSET', KEYS[1], 'updated_at', ARGV[3])
    return 1
  `,
};
