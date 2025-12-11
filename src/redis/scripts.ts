export const luaScripts = {
  // API-side: only user RPD + user concurrency
  combinedCheckAndAcquire: `
  -- KEYS[1] = user:{userId}:rpd:{type}:{DATE}
  -- KEYS[2] = user:{userId}:active_jobs

  -- ARGV[1] = user_day_limit
  -- ARGV[2] = concurrency_limit
  -- ARGV[3] = day_ttl (seconds)
  -- ARGV[4] = lock_ttl_seconds
  -- ARGV[5] = consume_amount
  -- ARGV[6] = now_timestamp_ms
  -- ARGV[7] = jobId

  local function getOrZero(key)
    local v = redis.call("GET", key)
    if not v then return 0 end
    return tonumber(v)
  end

  local user_day_limit = tonumber(ARGV[1])
  local concurrency_limit = tonumber(ARGV[2])
  local day_ttl = tonumber(ARGV[3])
  local lock_ttl = tonumber(ARGV[4])
  local consume = tonumber(ARGV[5])
  local now_ms = tonumber(ARGV[6])
  local expiry_ms = now_ms + lock_ttl * 1000

  -- 1. Cleanup zombie locks
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now_ms)

  -- 2. Concurrency gate
  if concurrency_limit > 0 then
    local count = redis.call('ZCARD', KEYS[2])
    if count >= concurrency_limit then
      return 0 -- CONCURRENCY_LIMIT_EXCEEDED
    end
  end

  -- 3. User RPD check
  local user_day = getOrZero(KEYS[1])
  if user_day_limit > 0 and (user_day + consume) > user_day_limit then
    return -4 -- USER_RPD_EXCEEDED
  end

  -- 4. Acquire
  if concurrency_limit > 0 then
    redis.call('ZADD', KEYS[2], expiry_ms, ARGV[7])
  end

  if user_day_limit > 0 then
    redis.call("INCRBY", KEYS[1], consume)
    redis.call("EXPIRE", KEYS[1], day_ttl)
  end

  return 1`,

  // Worker-side: model RPM/RPD + optional user RPD consume
  consumeExecutionLimits: `
  -- KEYS[1] = model:{modelId}:rpm
  -- KEYS[2] = model:{modelId}:rpd
  -- KEYS[3] = user:{userId}:rpd:{type}:{DATE}

  -- ARGV[1] = model_minute_limit
  -- ARGV[2] = model_day_limit
  -- ARGV[3] = user_day_limit
  -- ARGV[4] = minute_ttl (seconds)
  -- ARGV[5] = day_ttl (seconds)
  -- ARGV[6] = user_day_ttl (seconds)
  -- ARGV[7] = consume_amount

  local function getOrZero(key)
    local v = redis.call("GET", key)
    if not v then return 0 end
    return tonumber(v)
  end

  local consume = tonumber(ARGV[7])

  -- Limits check
  local model_minute = getOrZero(KEYS[1])
  if tonumber(ARGV[1]) > 0 and (model_minute + consume) > tonumber(ARGV[1]) then
    return -1 -- MODEL_RPM_EXCEEDED
  end

  local model_day = getOrZero(KEYS[2])
  if tonumber(ARGV[2]) > 0 and (model_day + consume) > tonumber(ARGV[2]) then
    return -2 -- MODEL_RPD_EXCEEDED
  end

  local user_day = getOrZero(KEYS[3])
  if tonumber(ARGV[3]) > 0 and (user_day + consume) > tonumber(ARGV[3]) then
    return -3 -- USER_RPD_EXCEEDED
  end

  -- Consume
  redis.call("INCRBY", KEYS[1], consume)
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[4]))

  redis.call("INCRBY", KEYS[2], consume)
  redis.call("EXPIRE", KEYS[2], tonumber(ARGV[5]))

  if tonumber(ARGV[3]) > 0 then
    redis.call("INCRBY", KEYS[3], consume)
    redis.call("EXPIRE", KEYS[3], tonumber(ARGV[6]))
  end

  return 1`,
};
