CREATE TABLE public.crm_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  image_data text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_signatures TO authenticated;
GRANT ALL ON public.crm_signatures TO service_role;
ALTER TABLE public.crm_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view signatures" ON public.crm_signatures FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users add signatures" ON public.crm_signatures FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users delete signatures" ON public.crm_signatures FOR DELETE TO authenticated USING (public.can_access_crm(business_id));
CREATE INDEX idx_crm_signatures_business ON public.crm_signatures(business_id);

ALTER TABLE public.crm_runsheets
  ADD COLUMN staff_sign_name text,
  ADD COLUMN staff_sign_date date,
  ADD COLUMN staff_signature text,
  ADD COLUMN client_sign_name text,
  ADD COLUMN client_sign_date date,
  ADD COLUMN client_signature text,
  ADD COLUMN client_signed_at timestamptz;

ALTER TABLE public.crm_settings ADD COLUMN signed_runsheet_email text;