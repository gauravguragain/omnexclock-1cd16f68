ALTER TABLE public.crm_runsheets ADD COLUMN IF NOT EXISTS foh_notes text;
ALTER TABLE public.crm_runsheets ADD COLUMN IF NOT EXISTS internal_share_token uuid DEFAULT gen_random_uuid() NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_runsheets_internal_share_token_key ON public.crm_runsheets (internal_share_token);