CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (NEW.raw_app_meta_data ? 'role') THEN
    NEW.raw_app_meta_data :=
      COALESCE(NEW.raw_app_meta_data, '{}'::JSONB) ||
      JSONB_BUILD_OBJECT('role', 'user');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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
    WHEN NEW.raw_app_meta_data->>'role' IN ('user', 'admin')
      THEN (NEW.raw_app_meta_data->>'role')::user_role
    ELSE 'user'
  END;

  PERFORM public.seed_user_limits(NEW.id, v_role);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_limits ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_limits
  AFTER INSERT OR UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_created_limits();
