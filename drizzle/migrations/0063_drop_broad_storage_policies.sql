-- Business-scoped replacement policies already exist for each of these.
DROP POLICY IF EXISTS "Authenticated users can upload runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read event runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Public can view runsheets for signed URLs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view dish photos" ON storage.objects;
-- business-logos is a public bucket; public URLs work without a listing policy.
DROP POLICY IF EXISTS "Public can view business logos" ON storage.objects;