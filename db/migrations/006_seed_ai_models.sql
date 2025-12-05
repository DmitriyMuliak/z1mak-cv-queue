-- Seed ai_models table with defaults; idempotent via upsert
INSERT INTO ai_models (id, provider, api_name, type, rpm, rpd, fallback_priority)
VALUES
  ('pro2dot5', 'gemini', 'gemini-2.5-pro', 'hard', 2, 50, 1),
  ('flash', 'gemini', 'gemini-2.5-flash', 'lite', 10, 250, 2),
  ('flashPreview', 'gemini', 'gemini-2.5-flash-preview-09-2025', 'lite', 15, 1000, 3),
  ('flashLite', 'gemini', 'gemini-2.5-flash-lite', 'lite', 15, 1000, 4)
ON CONFLICT (id) DO UPDATE
SET
  provider = EXCLUDED.provider,
  api_name = EXCLUDED.api_name,
  type = EXCLUDED.type,
  rpm = EXCLUDED.rpm,
  rpd = EXCLUDED.rpd,
  fallback_priority = EXCLUDED.fallback_priority,
  updated_at = NOW();
