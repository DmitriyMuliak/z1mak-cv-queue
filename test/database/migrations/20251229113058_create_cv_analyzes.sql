CREATE TABLE IF NOT EXISTS cv_analyzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resume_id UUID NULL,
  requested_model TEXT NOT NULL,
  processed_model TEXT NULL,
  status TEXT NOT NULL,
  result JSONB NULL,
  error TEXT NULL,
  error_code TEXT NULL,
  expired_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_cv_analyzes_user_created_at ON cv_analyzes(user_id, created_at);

-- RLS policies and grants removed for test environment compatibility

