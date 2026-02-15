-- Allow admins to update clock events
CREATE POLICY "Admins can update clock events"
ON public.clock_events
FOR UPDATE
USING (is_admin());

-- Allow admins to delete clock events
CREATE POLICY "Admins can delete clock events"
ON public.clock_events
FOR DELETE
USING (is_admin());

-- Allow admins to insert clock events (for manual entries)
CREATE POLICY "Admins can insert clock events"
ON public.clock_events
FOR INSERT
WITH CHECK (is_admin());