export const luaScripts = {
  combinedCheckAndAcquire: `
  -- KEYS[1] = model:{modelId}:rpm
  -- KEYS[2] = model:{modelId}:rpd
  -- KEYS[3] = user:{userId}:model:{modelId}:rpm
  -- KEYS[4] = user:{userId}:model:{modelId}:rpd:{DATE}
  -- KEYS[5] = user:{userId}:active_jobs

  -- ARGV[1] = model_minute_limit
  -- ARGV[2] = model_day_limit
  -- ARGV[3] = user_minute_limit
  -- ARGV[4] = user_day_limit
  -- ARGV[5] = concurrency_limit
  -- ARGV[6] = minute_ttl (seconds)
  -- ARGV[7] = day_ttl (seconds)
  -- ARGV[8] = consume_amount
  -- ARGV[9] = now_timestamp_ms
  -- ARGV[10] = jobId
  -- ARGV[11] = user_rpd_cleanup_ttl

  local function getOrZero(key)
    local v = redis.call("GET", key)
    if not v then return 0 end
    return tonumber(v)
  end

  local consume = tonumber(ARGV[8])
  local now_ms = tonumber(ARGV[9])

  -- I. Concurrency
  local concurrency_limit = tonumber(ARGV[5])
  if concurrency_limit > 0 then
    redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', now_ms)
    local count = redis.call('ZCARD', KEYS[5])
    if count >= concurrency_limit then
      return 0
    end
  end

  -- II. Model/User RPM/RPD tokens
  local model_minute = getOrZero(KEYS[1])
  local model_day = getOrZero(KEYS[2])
  local user_minute = getOrZero(KEYS[3])
  local user_day_usage = getOrZero(KEYS[4])

  if (model_minute + consume) > tonumber(ARGV[1]) then
    return -1
  end
  if (model_day + consume) > tonumber(ARGV[2]) then
    return -2
  end

  if tonumber(ARGV[3]) > 0 and (user_minute + consume) > tonumber(ARGV[3]) then
    return -3
  end

  -- III. User RPD Fixed Window
  local user_day_limit = tonumber(ARGV[4])
  if user_day_limit > 0 then
    if (user_day_usage + consume) > user_day_limit then
      return -4
    end
  end

  -- IV. Acquire / consume
  redis.call("INCRBY", KEYS[1], consume)
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[6]))

  redis.call("INCRBY", KEYS[2], consume)
  redis.call("EXPIRE", KEYS[2], tonumber(ARGV[7]))

  redis.call("INCRBY", KEYS[3], consume)
  redis.call("EXPIRE", KEYS[3], tonumber(ARGV[6]))

  if user_day_limit > 0 then
    redis.call("INCRBY", KEYS[4], consume)
    redis.call("EXPIRE", KEYS[4], tonumber(ARGV[11]))
  end

  -- TTL for Model RPD
  if concurrency_limit > 0 then
    local expiry_ms = now_ms + tonumber(ARGV[6]) * 1000
    redis.call('ZADD', KEYS[5], expiry_ms, ARGV[10])
  end

  return 1`,
};
