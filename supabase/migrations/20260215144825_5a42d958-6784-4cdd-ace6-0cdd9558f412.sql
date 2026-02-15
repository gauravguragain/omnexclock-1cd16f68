-- Allow anonymous users to read clock events (needed for kiosk status check)
CREATE POLICY "Anon can read clock events"
ON public.clock_events
FOR SELECT
TO anon
USING (true);
