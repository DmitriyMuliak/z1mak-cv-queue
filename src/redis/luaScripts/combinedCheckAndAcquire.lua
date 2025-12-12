-- KEYS[1] = user:{userId}:rpd:{type}:{DATE}
-- KEYS[2] = user:{userId}:active_jobs
-- KEYS[3] = model:{modelId}:rpd

-- ARGV[1] = user_day_limit
-- ARGV[2] = concurrency_limit
-- ARGV[3] = day_ttl (seconds)
-- ARGV[4] = lock_ttl_seconds
-- ARGV[5] = consume_amount
-- ARGV[6] = now_timestamp_ms
-- ARGV[7] = jobId
-- ARGV[8] = model_day_limit
-- ARGV[9] = model_day_ttl (seconds)

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
local model_day_limit = tonumber(ARGV[8])
local model_day_ttl = tonumber(ARGV[9])

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

-- 4. Model RPD check (no consumption)
local model_day = getOrZero(KEYS[3])
if model_day_limit > 0 and (model_day + consume) > model_day_limit then
  return -2 -- MODEL_RPD_EXCEEDED
end

-- 5. Acquire
if concurrency_limit > 0 then
  redis.call('ZADD', KEYS[2], expiry_ms, ARGV[7])
end

if user_day_limit > 0 then
  redis.call("INCRBY", KEYS[1], consume)
  redis.call("EXPIRE", KEYS[1], day_ttl)
end

if model_day_limit > 0 then
  redis.call("EXPIRE", KEYS[3], model_day_ttl)
end

return 1
