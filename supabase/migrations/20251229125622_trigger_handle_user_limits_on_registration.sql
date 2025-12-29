-- Function to seed user limits based on role
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
    v_hard_rpd := 1;
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
$$ LANGUAGE plpgsql;

-- FN to handle user creation and seed limits
CREATE OR REPLACE FUNCTION public.handle_user_created_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := CASE
    WHEN (new.raw_user_meta_data->>'role') IN ('user','admin')
      THEN (new.raw_user_meta_data->>'role')::user_role
    ELSE 'user'
  END;

  PERFORM public.seed_user_limits(new.id, v_role);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_limits ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_limits
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_created_limits();
