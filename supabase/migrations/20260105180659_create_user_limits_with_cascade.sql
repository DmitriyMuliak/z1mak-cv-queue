ALTER TABLE public.user_limits 
DROP CONSTRAINT IF EXISTS user_limits_user_fk;

ALTER TABLE public.user_limits
ADD CONSTRAINT user_limits_user_id_fk 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_limits_user_id ON public.user_limits(user_id);