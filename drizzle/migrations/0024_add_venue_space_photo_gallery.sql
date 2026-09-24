ALTER TABLE public.crm_venue_spaces
  ADD COLUMN IF NOT EXISTS cover_photo_path text,
  ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}';

DROP POLICY IF EXISTS "CRM users view venue photos" ON storage.objects;
CREATE POLICY "CRM users view venue photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'venue-space-photos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND public.can_access_crm(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "CRM users upload venue photos" ON storage.objects;
CREATE POLICY "CRM users upload venue photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'venue-space-photos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND public.can_access_crm(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "CRM users update venue photos" ON storage.objects;
CREATE POLICY "CRM users update venue photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'venue-space-photos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND public.can_access_crm(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'venue-space-photos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND public.can_access_crm(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "CRM users delete venue photos" ON storage.objects;
CREATE POLICY "CRM users delete venue photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'venue-space-photos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND public.can_access_crm(((storage.foldername(name))[1])::uuid)
);