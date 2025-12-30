-- https://supabase.com/docs/guides/local-development/seeding-your-database

-- Seed ai_models table with defaults; idempotent via upsert
INSERT INTO ai_models (id, provider, api_name, type, rpm, rpd, fallback_priority)
VALUES
  ('flash3', 'gemini', 'gemini-3-flash', 'hard', 5, 20, 1),
  ('flash', 'gemini', 'gemini-2.5-flash', 'lite', 5, 20, 2),
  ('flashLite', 'gemini', 'gemini-2.5-flash-lite', 'lite', 10, 20, 3)
ON CONFLICT (id) DO UPDATE
SET
  provider = EXCLUDED.provider,
  api_name = EXCLUDED.api_name,
  type = EXCLUDED.type,
  rpm = EXCLUDED.rpm,
  rpd = EXCLUDED.rpd,
  fallback_priority = EXCLUDED.fallback_priority,
  updated_at = NOW();
