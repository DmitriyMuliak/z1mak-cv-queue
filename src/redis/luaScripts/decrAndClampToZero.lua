-- KEYS[1] = key to decrement

local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local next_val = current - 1
if next_val < 0 then next_val = 0 end
redis.call('SET', KEYS[1], next_val)
return next_val
