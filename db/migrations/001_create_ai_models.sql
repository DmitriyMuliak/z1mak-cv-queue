-- AI models reference table
CREATE TYPE ai_model_type AS ENUM ('hard', 'lite');

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  api_name TEXT NOT NULL UNIQUE,
  type ai_model_type NOT NULL,
  rpm INTEGER NOT NULL,
  rpd INTEGER NOT NULL,
  fallback_priority INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
