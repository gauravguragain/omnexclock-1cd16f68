ALTER TABLE public.crm_menu_selection_items ADD COLUMN IF NOT EXISTS course text;

ALTER TABLE public.crm_menu_selections
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS package_price_per_head numeric,
  ADD COLUMN IF NOT EXISTS corkage_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS corkage_per_head numeric,
  ADD COLUMN IF NOT EXISTS corkage_flat numeric;