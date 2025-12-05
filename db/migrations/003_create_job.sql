-- Job table (persisted after Redis sync)
CREATE TABLE IF NOT EXISTS job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resume_id UUID NULL,
  requested_model TEXT NOT NULL,
  processed_model TEXT NULL,
  status TEXT NOT NULL,
  result JSONB NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  CONSTRAINT job_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT job_resume_fk FOREIGN KEY (resume_id) REFERENCES resume(id)
);

CREATE INDEX IF NOT EXISTS idx_job_user_created_at ON job(user_id, created_at);
