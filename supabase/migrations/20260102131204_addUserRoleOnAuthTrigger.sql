CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF NOT (NEW.raw_app_metadata ? 'role') THEN
    NEW.raw_app_metadata := 
      COALESCE(NEW.raw_app_metadata, '{}'::JSONB) || 
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