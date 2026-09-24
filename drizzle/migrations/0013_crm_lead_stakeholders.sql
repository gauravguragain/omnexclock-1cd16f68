CREATE TABLE public.crm_lead_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.crm_stakeholders(id) ON DELETE CASCADE,
  role text,
  arrival_time text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, stakeholder_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_stakeholders TO authenticated;
GRANT ALL ON public.crm_lead_stakeholders TO service_role;
ALTER TABLE public.crm_lead_stakeholders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage lead stakeholders" ON public.crm_lead_stakeholders FOR ALL TO authenticated
USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));