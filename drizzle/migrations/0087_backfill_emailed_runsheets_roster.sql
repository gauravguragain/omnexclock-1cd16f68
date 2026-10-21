-- The content of this migration is superseded by 0088_backfill_emailed_runsheets_roster.sql,
-- which projects the same emailed run sheets with per-row error handling. Kept (commented out)
-- so the migration set stays in journal order.

-- COMMENT ON FUNCTION public.crm_sync_runsheet_roster(uuid) IS 'Projects an emailed CRM run sheet into Daily Event Setup.';
-- DO $$ DECLARE r record; BEGIN
--  FOR r IN SELECT id FROM public.crm_runsheets WHERE emailed_at IS NOT NULL OR cardinality(emailed_to)>0 LOOP
--   PERFORM public.crm_sync_runsheet_roster(r.id);
--  END LOOP;
-- END $$;