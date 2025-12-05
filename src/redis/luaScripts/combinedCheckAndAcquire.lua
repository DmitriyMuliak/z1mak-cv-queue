
-- KEYS[1] = Model RPM (GET/INCRBY)
-- KEYS[2] = Model RPD (GET/INCRBY)
-- KEYS[3] = User RPM (GET/INCRBY)
-- KEYS[4] = User RPD (GET/INCRBY)
-- KEYS[5] = User Concurrency Lock (ZSET)

-- ARGV[1] = model_minute_limit
-- ARGV[2] = model_day_limit
-- ARGV[3] = user_minute_limit
-- ARGV[4] = user_day_limit
-- ARGV[5] = concurrency_limit
-- ARGV[6] = minute_ttl (seconds)
-- ARGV[7] = day_ttl (seconds)
-- ARGV[8] = consume_amount
-- ARGV[9] = now_timestamp_ms (для ZSET)
-- ARGV[10] = jobId (для ZADD)

------------------------------------------
-- UTILS
------------------------------------------
local function getOrZero(key)
  local v = redis.call("GET", key)
  if not v then return 0 end
  return tonumber(v)
end

local consume = tonumber(ARGV[8])

------------------------------------------
-- I. CONCURRENCY LOCK CHECK AND ACQUIRE
------------------------------------------
local now_ms = tonumber(ARGV[9])
local expiry_ms = now_ms + tonumber(ARGV[6]) * 1000 -- TTL в секундах -> мс
local concurrency_limit = tonumber(ARGV[5])

-- 1. Cleanup Zombie Locks
redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', now_ms)

-- 2. Check Limit
local count = redis.call('ZCARD', KEYS[5])
if count >= concurrency_limit then 
  return 0 -- CONCURRENCY_LIMIT_EXCEEDED (використовуємо 0, як у вашому попередньому скрипті)
end

------------------------------------------
-- II. TOKEN BUCKET CONSUME CHECKS
------------------------------------------
local model_minute = getOrZero(KEYS[1])
local model_day = getOrZero(KEYS[2])
local user_minute = getOrZero(KEYS[3])
local user_day = getOrZero(KEYS[4])

-- 1. Перевірка лімітів Моделі
if (model_minute + consume) > tonumber(ARGV[1]) then
  return -1 -- MODEL_RPM_EXCEEDED
end
if (model_day + consume) > tonumber(ARGV[2]) then
  return -2 -- MODEL_RPD_EXCEEDED
end

-- 2. Перевірка лімітів Користувача
if tonumber(ARGV[3]) > 0 and (user_minute + consume) > tonumber(ARGV[3]) then
  return -3 -- USER_RPM_EXCEEDED
end
if tonumber(ARGV[4]) > 0 and (user_day + consume) > tonumber(ARGV[4]) then
  return -4 -- USER_RPD_EXCEEDED
end

------------------------------------------
-- III. ACQUIRE & CONSUME
------------------------------------------

-- 1. Consume Tokens
redis.call("INCRBY", KEYS[1], consume)
redis.call("INCRBY", KEYS[2], consume)
redis.call("INCRBY", KEYS[3], consume)
redis.call("INCRBY", KEYS[4], consume)

-- 2. Set/Update TTL (EXPIRE)
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[6])) -- Model RPM
redis.call("EXPIRE", KEYS[3], tonumber(ARGV[6])) -- User RPM

redis.call("EXPIRE", KEYS[2], tonumber(ARGV[7])) -- Model RPD
redis.call("EXPIRE", KEYS[4], tonumber(ARGV[7])) -- User RPD

-- 3. Acquire Concurrency Lock
redis.call('ZADD', KEYS[5], expiry_ms, ARGV[10])

return 1 -- OK