ALTER TABLE public.crm_options DROP CONSTRAINT IF EXISTS crm_options_option_type_check;
ALTER TABLE public.crm_options ADD CONSTRAINT crm_options_option_type_check CHECK (option_type IN ('lead_source','event_type','lost_reason','lead_stage','venue_space','beverage_package','live_stall','dietary_tag','tag','setup_item','service_course'));

CREATE TABLE public.crm_runsheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL UNIQUE REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.crm_bookings(id) ON DELETE SET NULL,
  event_order_number text,
  booking_reference text,
  sales_person text,
  event_coordinator text,
  onsite_contact_name text,
  onsite_contact_phone text,
  adult_guests integer,
  kids_guests integer,
  access_time text,
  setup_items text[] NOT NULL DEFAULT '{}',
  setup_notes text,
  service_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  special_requests text,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_runsheets TO authenticated;
GRANT ALL ON public.crm_runsheets TO service_role;
ALTER TABLE public.crm_runsheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view runsheets" ON public.crm_runsheets FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create runsheets" ON public.crm_runsheets FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update runsheets" ON public.crm_runsheets FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM admins delete runsheets" ON public.crm_runsheets FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));
CREATE INDEX idx_crm_runsheets_business ON public.crm_runsheets(business_id);
CREATE TRIGGER crm_runsheets_touch BEFORE UPDATE ON public.crm_runsheets FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();