ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'food_safety_manager';

CREATE OR REPLACE FUNCTION public.can_manage_fsl(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND business_id = _business_id
    AND role::text IN ('admin','super_admin','food_safety_manager'))
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_fsl(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND business_id = _business_id
    AND role::text IN ('admin','super_admin','viewer','roster_admin','sales_marketing_manager','food_safety_manager'))
$$;

DROP POLICY IF EXISTS "fsl forms write" ON public.fsl_forms;
CREATE POLICY "fsl forms write" ON public.fsl_forms FOR ALL TO authenticated USING (public.can_manage_fsl(business_id)) WITH CHECK (public.can_manage_fsl(business_id));
DROP POLICY IF EXISTS "fsl versions write" ON public.fsl_form_versions;
CREATE POLICY "fsl versions write" ON public.fsl_form_versions FOR ALL TO authenticated USING (public.can_manage_fsl(business_id)) WITH CHECK (public.can_manage_fsl(business_id));
DROP POLICY IF EXISTS "fsl settings write" ON public.fsl_settings;
CREATE POLICY "fsl settings write" ON public.fsl_settings FOR ALL TO authenticated USING (public.can_manage_fsl(business_id)) WITH CHECK (public.can_manage_fsl(business_id));
DROP POLICY IF EXISTS "fsl entries write" ON public.fsl_entries;
CREATE POLICY "fsl entries write" ON public.fsl_entries FOR ALL TO authenticated USING (public.can_manage_fsl(business_id)) WITH CHECK (public.can_manage_fsl(business_id));
DROP POLICY IF EXISTS "fsl audit insert" ON public.fsl_entry_audit;
CREATE POLICY "fsl audit insert" ON public.fsl_entry_audit FOR INSERT TO authenticated WITH CHECK (public.can_manage_fsl(business_id));
DROP POLICY IF EXISTS "fsl templates insert" ON storage.objects;
CREATE POLICY "fsl templates insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fsl-templates' AND public.can_manage_fsl(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "fsl templates update" ON storage.objects;
CREATE POLICY "fsl templates update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'fsl-templates' AND public.can_manage_fsl(((storage.foldername(name))[1])::uuid));