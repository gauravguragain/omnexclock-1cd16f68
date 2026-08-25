DO $do$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND qual ILIKE '%event-runsheets%'
      AND ('anon' = ANY(roles) OR roles = '{public}')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END
$do$;

DROP POLICY IF EXISTS "Authenticated can read event runsheets" ON storage.objects;
CREATE POLICY "Authenticated can read event runsheets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'event-runsheets');