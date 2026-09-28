DROP POLICY IF EXISTS "Service role can update invitations" ON public.admin_invitations;
DROP POLICY IF EXISTS "Public can view runsheets for signed URLs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read event runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update runsheets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view runsheets" ON storage.objects;