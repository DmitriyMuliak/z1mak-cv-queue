-- KEYS[1] = user:{userId}:model:{modelId}:24h_history (ZSET)
-- ARGV[1] = now_timestamp_ms (Поточний час, наприклад, 1733390400000)
-- ARGV[2] = window_ms (Розмір вікна, наприклад, 86400000 мс = 24 години)
-- ARGV[3] = rpd_limit (Наприклад, 100)
-- ARGV[4] = jobId (ID поточного запиту)

local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local min_score = now - window -- Час, до якого запити вважаються старими

-- 1. CLEANUP (Атомарне видалення старих записів)
-- Видаляємо всі записи, чий score (timestamp) менший за min_score
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', min_score)

-- 2. CHECK (Перевірка поточного використання)
local current_usage = redis.call('ZCARD', KEYS[1])

if current_usage >= limit then
  return 0 -- USER_RPD_LIMIT_EXCEEDED
end

-- 3. ACQUIRE (Споживання: додаємо новий запис)
-- score = now (поточний час), member = jobId
redis.call('ZADD', KEYS[1], now, ARGV[4])

return 1 -- OK