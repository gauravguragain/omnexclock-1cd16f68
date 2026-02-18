
-- Add geolocation column to clock_events
ALTER TABLE public.clock_events ADD COLUMN geolocation jsonb DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.clock_events.geolocation IS 'Stores latitude, longitude, and accuracy from browser Geolocation API';
