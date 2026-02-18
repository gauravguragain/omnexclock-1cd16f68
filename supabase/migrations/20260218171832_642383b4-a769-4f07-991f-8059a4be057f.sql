
-- Create helper function to check master role
CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'master' AND business_id IS NULL
  )
$$;

-- Assign master role to edu.gauravguragain@gmail.com
INSERT INTO public.user_roles (user_id, role, business_id)
SELECT p.id, 'master'::app_role, NULL
FROM public.profiles p
WHERE p.email = 'edu.gauravguragain@gmail.com';

-- Remove edu.gauravguragain@gmail.com's admin role from PRP business
DELETE FROM public.user_roles
WHERE user_id = (SELECT id FROM profiles WHERE email = 'edu.gauravguragain@gmail.com')
  AND role = 'admin'
  AND business_id IS NOT NULL;

-- Allow master admins to view all businesses
CREATE POLICY "Master can view all businesses"
ON public.businesses FOR SELECT
USING (is_master());

-- Allow master to view all profiles
CREATE POLICY "Master can view all profiles"
ON public.profiles FOR SELECT
USING (is_master());

-- Allow master to read user_roles
CREATE POLICY "Master can view all roles"
ON public.user_roles FOR SELECT
USING (is_master());
