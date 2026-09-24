ALTER TABLE public.crm_runsheets ADD COLUMN IF NOT EXISTS emailed_at timestamptz, ADD COLUMN IF NOT EXISTS emailed_to text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.crm_event_managers(_business_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.id, p.full_name, p.email
  FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
  WHERE r.business_id = _business_id
    AND r.role IN ('admin','super_admin','sales_marketing_manager')
    AND p.email IS NOT NULL
    AND public.can_access_crm(_business_id)
  ORDER BY p.full_name
$$;
REVOKE ALL ON FUNCTION public.crm_event_managers(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.crm_event_managers(uuid) TO authenticated;