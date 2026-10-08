CREATE OR REPLACE FUNCTION public.fsl_reset_forms(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_fsl(_business_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.fsl_entry_audit WHERE business_id = _business_id;
  DELETE FROM public.fsl_entries WHERE business_id = _business_id;
  DELETE FROM public.fsl_form_versions WHERE business_id = _business_id;
  DELETE FROM public.fsl_forms WHERE business_id = _business_id;
END $$;
REVOKE ALL ON FUNCTION public.fsl_reset_forms(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fsl_reset_forms(uuid) TO authenticated;