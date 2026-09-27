ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS external_ref text;
ALTER TABLE public.crm_bookings ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_business_external_ref_key ON public.crm_leads(business_id, external_ref);
CREATE UNIQUE INDEX IF NOT EXISTS crm_bookings_business_external_ref_key ON public.crm_bookings(business_id, external_ref);