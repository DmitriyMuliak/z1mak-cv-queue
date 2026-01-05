ALTER TABLE public.cv_analyzes 
DROP CONSTRAINT IF EXISTS job_user_fk;

ALTER TABLE public.cv_analyzes
ADD CONSTRAINT cv_analyzes_user_id_fk 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cv_analyzes_user_id ON cv_analyzes(user_id);