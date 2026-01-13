-- Update default user limits for non-admin roles
CREATE OR REPLACE FUNCTION public.seed_user_limits(_user_id UUID, _role user_role)
RETURNS VOID AS $$
DECLARE
  v_hard_rpd INTEGER;
  v_lite_rpd INTEGER;
  v_max_concurrency INTEGER;
  v_unlimited BOOLEAN;
BEGIN
  IF _role = 'admin' THEN
    v_hard_rpd := NULL;
    v_lite_rpd := NULL;
    v_max_concurrency := NULL;
    v_unlimited := TRUE;
  ELSE
    v_hard_rpd := 3;
    v_lite_rpd := 4;
    v_max_concurrency := 2;
    v_unlimited := FALSE;
  END IF;

  INSERT INTO user_limits (user_id, role, hard_rpd, lite_rpd, max_concurrency, unlimited)
  VALUES (_user_id, _role, v_hard_rpd, v_lite_rpd, v_max_concurrency, v_unlimited)
  ON CONFLICT (user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    hard_rpd = EXCLUDED.hard_rpd,
    lite_rpd = EXCLUDED.lite_rpd,
    max_concurrency = EXCLUDED.max_concurrency,
    unlimited = EXCLUDED.unlimited;
END;
$$ LANGUAGE plpgsql
SET search_path = public;
