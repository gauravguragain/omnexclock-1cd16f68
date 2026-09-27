CREATE OR REPLACE FUNCTION public.is_owner_of_business(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND business_id = _business_id
      AND role IN ('owner', 'super_admin')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_owner_of_business(uuid, uuid) TO authenticated;