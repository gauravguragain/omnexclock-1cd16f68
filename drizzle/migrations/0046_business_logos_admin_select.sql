CREATE POLICY "Business admins can read own logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'business-logos'
         AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         AND (public.is_admin_of_business(((storage.foldername(name))[1])::uuid)
              OR public.is_super_admin_of_business(((storage.foldername(name))[1])::uuid)));