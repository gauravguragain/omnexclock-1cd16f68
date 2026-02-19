
ALTER TABLE public.roster_day_events
  ADD COLUMN IF NOT EXISTS adult_guests integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kids_guests integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS smoke_machine boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_stall boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_stall_details text DEFAULT NULL;
