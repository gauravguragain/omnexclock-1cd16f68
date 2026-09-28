CREATE OR REPLACE FUNCTION public.is_published_dish_photo(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.crm_dishes d WHERE d.photo_path = _path);
$$;
GRANT EXECUTE ON FUNCTION public.is_published_dish_photo(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view dish photos" ON storage.objects;
CREATE POLICY "Guests can view photos of listed dishes" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'dish-photos' AND public.is_published_dish_photo(name));
CREATE POLICY "CRM users view dish photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dish-photos' AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
         AND (public.can_access_crm(((storage.foldername(name))[1])::uuid) OR public.is_published_dish_photo(name)));

-- business-logos is a public bucket: files are served by public URL without any SELECT policy,
-- so the broad listing rule is not needed.
DROP POLICY IF EXISTS "Public can view business logos" ON storage.objects;