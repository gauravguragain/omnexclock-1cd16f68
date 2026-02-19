-- Allow anonymous/public read access to event-runsheets for signed URL generation
CREATE POLICY "Public can view runsheets for signed URLs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'event-runsheets');
