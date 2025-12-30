-- KEYS[1] = queue:waiting:{model} (or '__nil__')
-- KEYS[2] = user:{userId}:active_jobs (or '__nil__')
-- KEYS[3] = user:{userId}:rpd:{type}:{DATE} (or '__nil__')
-- KEYS[4] = job:{jobId}:result
-- KEYS[5] = job:{jobId}:meta

-- ARGV[1] = day_ttl (seconds)
-- ARGV[2] = finished_at (ISO string)
-- ARGV[3] = updated_at (ISO string)
-- ARGV[4] = status (e.g., "failed")
-- ARGV[5] = error (e.g., "expired")
-- ARGV[6] = error_code (e.g., "expired")
-- ARGV[7] = jobId

local day_ttl = tonumber(ARGV[1]) or 0
local finished_at = ARGV[2]
local updated_at = ARGV[3]
local status = ARGV[4]
local err = ARGV[5]
local err_code = ARGV[6]
local jobId = ARGV[7]

local function isNilKey(key)
  return key == nil or key == '' or key == '__nil__'
end

local function decrAndClamp(key)
  if isNilKey(key) then return nil end
  local current = tonumber(redis.call('GET', key) or '0')
  local next_val = current - 1
  if next_val < 0 then next_val = 0 end
  redis.call('SET', key, next_val)
  return next_val
end

if not isNilKey(KEYS[1]) then
  decrAndClamp(KEYS[1])
end

if not isNilKey(KEYS[2]) and jobId and jobId ~= '' then
  redis.call('ZREM', KEYS[2], jobId)
end

if not isNilKey(KEYS[3]) then
  decrAndClamp(KEYS[3])
  if day_ttl > 0 then
    redis.call('EXPIRE', KEYS[3], day_ttl)
  end
end

redis.call('HSET', KEYS[4], 'status', status, 'error', err, 'error_code', err_code, 'finished_at', finished_at, 'expired_at', finished_at)
redis.call('HSET', KEYS[5], 'status', status, 'updated_at', updated_at)

return 1
