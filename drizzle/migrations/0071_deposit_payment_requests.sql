ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS deposit_account_name text,
  ADD COLUMN IF NOT EXISTS deposit_bsb text,
  ADD COLUMN IF NOT EXISTS deposit_account_number text,
  ADD COLUMN IF NOT EXISTS deposit_payment_note text,
  ADD COLUMN IF NOT EXISTS deposit_proof_email text;

CREATE TABLE public.crm_deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.crm_bookings(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text,
  amount numeric,
  due_date date,
  event_title text,
  proof_path text,
  proof_uploaded_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_deposit_requests TO authenticated;
GRANT ALL ON public.crm_deposit_requests TO service_role;
ALTER TABLE public.crm_deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business members view deposit requests" ON public.crm_deposit_requests
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE INDEX crm_deposit_requests_lead_idx ON public.crm_deposit_requests(lead_id);