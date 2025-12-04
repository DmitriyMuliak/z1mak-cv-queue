-- Seed ai_models table with defaults; idempotent via upsert
INSERT INTO ai_models (id, provider, api_name, type, rpm, rpd, fallback_priority)
VALUES
  ('pro3', 'gemini', 'gemini-3-pro-preview', 'hard', 300, 20000, 1),
  ('pro2dot5', 'gemini', 'gemini-2.5-pro', 'hard', 400, 30000, 2),
  ('flash', 'gemini', 'gemini-2.5-flash', 'lite', 600, 50000, 3),
  ('flashPreview', 'gemini', 'gemini-2.5-flash-preview-09-2025', 'lite', 400, 30000, 4),
  ('flashLite', 'gemini', 'gemini-2.5-flash-lite', 'lite', 900, 80000, 5)
ON CONFLICT (id) DO UPDATE
SET
  provider = EXCLUDED.provider,
  api_name = EXCLUDED.api_name,
  type = EXCLUDED.type,
  rpm = EXCLUDED.rpm,
  rpd = EXCLUDED.rpd,
  fallback_priority = EXCLUDED.fallback_priority,
  updated_at = NOW();
