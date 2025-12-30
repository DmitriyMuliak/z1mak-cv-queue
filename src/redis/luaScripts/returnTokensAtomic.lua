-- KEYS[1] = model:{modelId}:rpm
-- KEYS[2] = model:{modelId}:rpd
-- KEYS[3] = user:{userId}:rpd:{type}:{DATE} (optional; use '__nil__' to skip)

-- ARGV[1] = consume_amount
-- ARGV[2] = minute_ttl (seconds)
-- ARGV[3] = day_ttl (seconds)
-- ARGV[4] = user_day_ttl (seconds)

local consume = tonumber(ARGV[1]) or 1
local minute_ttl = tonumber(ARGV[2]) or 0
local day_ttl = tonumber(ARGV[3]) or 0
local user_day_ttl = tonumber(ARGV[4]) or 0

local function isNilKey(key)
  return key == nil or key == '' or key == '__nil__'
end

local function decrAndClamp(key, ttl)
  if isNilKey(key) then return nil end
  local current = tonumber(redis.call('GET', key) or '0')
  local next_val = current - consume
  if next_val < 0 then next_val = 0 end
  redis.call('SET', key, next_val)
  if ttl > 0 then
    redis.call('EXPIRE', key, ttl)
  end
  return next_val
end

local rpm = decrAndClamp(KEYS[1], minute_ttl)
local rpd = decrAndClamp(KEYS[2], day_ttl)
local user = decrAndClamp(KEYS[3], user_day_ttl)

return { rpm, rpd, user }
