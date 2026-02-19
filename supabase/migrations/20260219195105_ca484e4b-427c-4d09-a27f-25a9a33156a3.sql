-- Fix business-logos bucket: restrict uploads/updates to business owners and admins only

DROP POLICY IF EXISTS "Users can upload business logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update business logos" ON storage.objects;

-- Only business owners or admins can upload logos (file path must start with business_id/)
CREATE POLICY "Business owners can upload logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'business-logos'
  AND auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id::text = split_part(name, '/', 1)
      AND owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND business_id::text = split_part(name, '/', 1)
    )
  )
);

-- Only business owners or admins can update logos
CREATE POLICY "Business owners can update logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'business-logos'
  AND auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id::text = split_part(name, '/', 1)
      AND owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND business_id::text = split_part(name, '/', 1)
    )
  )
);