COMMENT ON FUNCTION public.crm_sync_runsheet_roster(uuid) IS 'Projects an emailed CRM run sheet into Daily Event Setup.';
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT id FROM public.crm_runsheets WHERE emailed_at IS NOT NULL OR cardinality(emailed_to)>0 LOOP
  PERFORM public.crm_sync_runsheet_roster(r.id);
 END LOOP;
END $$;