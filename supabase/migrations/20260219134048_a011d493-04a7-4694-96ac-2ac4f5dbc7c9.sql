
-- Add runsheet_url column to roster_day_events
ALTER TABLE public.roster_day_events ADD COLUMN runsheet_url text NULL;

-- Create storage bucket for runsheets
INSERT INTO storage.buckets (id, name, public) VALUES ('event-runsheets', 'event-runsheets', true);

-- Storage policies for runsheets
CREATE POLICY "Authenticated users can upload runsheets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'event-runsheets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view runsheets"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-runsheets');

CREATE POLICY "Authenticated users can update runsheets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'event-runsheets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete runsheets"
ON storage.objects FOR DELETE
USING (bucket_id = 'event-runsheets' AND auth.uid() IS NOT NULL);
