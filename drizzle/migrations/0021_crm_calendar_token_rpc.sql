CREATE OR REPLACE FUNCTION public.get_crm_calendar_token(_business_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  IF NOT public.can_access_crm(_business_id) THEN RETURN NULL; END IF;
  SELECT calendar_token INTO t FROM public.crm_settings WHERE business_id = _business_id;
  IF t IS NULL THEN
    INSERT INTO public.crm_settings(business_id) VALUES (_business_id)
    ON CONFLICT (business_id) DO UPDATE SET calendar_token = COALESCE(crm_settings.calendar_token, encode(extensions.gen_random_bytes(24),'hex'))
    RETURNING calendar_token INTO t;
  END IF;
  RETURN t;
END $$;
REVOKE ALL ON FUNCTION public.get_crm_calendar_token(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_crm_calendar_token(uuid) TO authenticated;