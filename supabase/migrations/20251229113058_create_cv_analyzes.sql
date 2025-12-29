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
  finished_at TIMESTAMPTZ NULL,
  CONSTRAINT job_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_cv_analyzes_user_created_at ON cv_analyzes(user_id, created_at);

-- Enable Row Level Security
ALTER TABLE public.cv_analyzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_analyzes_select_own"
ON public.cv_analyzes
FOR SELECT
USING ((select auth.uid()) = user_id);

GRANT SELECT ON public.cv_analyzes TO authenticated;
