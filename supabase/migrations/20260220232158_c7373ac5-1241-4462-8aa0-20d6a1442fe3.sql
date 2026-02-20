-- Add a notes column to clock_events for kiosk clock-out descriptions
ALTER TABLE public.clock_events ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;