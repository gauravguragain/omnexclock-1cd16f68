ALTER TABLE public.crm_runsheets
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS distributed_to text,
  ADD COLUMN IF NOT EXISTS client_notes text,
  ADD COLUMN IF NOT EXISTS ops_notes text;