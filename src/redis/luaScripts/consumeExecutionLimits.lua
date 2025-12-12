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

return 1