DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'employees',
    'employee_requests',
    'invoices',
    'forum_posts',
    'forum_comments',
    'forum_reactions',
    'notifications',
    'fsl_entries',
    'fsl_forms'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', table_name);
  END LOOP;
END
$$;