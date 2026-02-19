
-- Fix 1: Make profile update policies PERMISSIVE so admins can approve other users
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Also allow master to update profiles (for master approval flow)
CREATE POLICY "Master can update all profiles"
  ON public.profiles FOR UPDATE
  USING (is_master())
  WITH CHECK (is_master());

-- Fix 2: Update register_business to NOT auto-approve the user
CREATE OR REPLACE FUNCTION public.register_business(_business_name text, _business_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_business_id UUID;
  calling_user_id UUID;
BEGIN
  calling_user_id := auth.uid();
  IF calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO businesses (name, business_code, owner_id, email)
  VALUES (_business_name, _business_code, calling_user_id, 
    (SELECT email FROM auth.users WHERE id = calling_user_id))
  RETURNING id INTO new_business_id;

  INSERT INTO user_roles (user_id, role, business_id)
  VALUES (calling_user_id, 'admin', new_business_id);

  -- Do NOT auto-approve: master must approve the user
  -- UPDATE profiles SET approved = true WHERE id = calling_user_id;

  RETURN new_business_id;
END;
$function$;
