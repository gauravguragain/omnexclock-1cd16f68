CREATE TABLE public.crm_menu_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  source text NOT NULL DEFAULT 'menu_books',
  summary text,
  package_ids uuid[] NOT NULL DEFAULT '{}',
  include_drinks boolean NOT NULL DEFAULT false,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.crm_menu_sends TO authenticated;
GRANT ALL ON public.crm_menu_sends TO service_role;
ALTER TABLE public.crm_menu_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM staff read menu sends" ON public.crm_menu_sends FOR SELECT TO authenticated USING (public.can_access_crm(business_id) OR public.is_owner_of_business(business_id));
CREATE POLICY "CRM staff log menu sends" ON public.crm_menu_sends FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE INDEX crm_menu_sends_customer_idx ON public.crm_menu_sends(customer_id);