CREATE TYPE user_role AS ENUM ('user', 'admin');

CREATE TABLE IF NOT EXISTS user_limits (
  user_id UUID PRIMARY KEY,
  role user_role NOT NULL,
  hard_rpd INTEGER NULL,
  lite_rpd INTEGER NULL,
  max_concurrency INTEGER NULL,
  unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_limits_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.user_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_limits_select_own"
ON public.user_limits
FOR SELECT
USING ((select auth.uid()) = user_id);

GRANT SELECT ON public.user_limits TO authenticated;
