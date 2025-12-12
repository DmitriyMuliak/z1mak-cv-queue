-- Purpose: validate and consume only model limits (RPM/RPD).
-- User RPD is consumed on the API layer.
-- KEYS[1] = model:{modelId}:rpm
-- KEYS[2] = model:{modelId}:rpd

-- ARGV[1] = model_minute_limit
-- ARGV[2] = model_day_limit
-- ARGV[3] = minute_ttl (seconds)
-- ARGV[4] = day_ttl (seconds)
-- ARGV[5] = consume_amount

local function getOrZero(key)
  local v = redis.call("GET", key)
  if not v then return 0 end
  return tonumber(v)
end

local consume = tonumber(ARGV[5])

-- Limits check
local model_minute = getOrZero(KEYS[1])
if tonumber(ARGV[1]) > 0 and (model_minute + consume) > tonumber(ARGV[1]) then
  return -1 -- MODEL_RPM_EXCEEDED
end

local model_day = getOrZero(KEYS[2])
if tonumber(ARGV[2]) > 0 and (model_day + consume) > tonumber(ARGV[2]) then
  return -2 -- MODEL_RPD_EXCEEDED
end

-- Consume
redis.call("INCRBY", KEYS[1], consume)
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3]))

redis.call("INCRBY", KEYS[2], consume)
redis.call("EXPIRE", KEYS[2], tonumber(ARGV[4]))

return 1
