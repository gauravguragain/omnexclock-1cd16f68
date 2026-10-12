CREATE TABLE public.crm_day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  content text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, note_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_day_notes TO authenticated;
GRANT ALL ON public.crm_day_notes TO service_role;
ALTER TABLE public.crm_day_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage day notes" ON public.crm_day_notes FOR ALL TO authenticated
  USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE TRIGGER crm_day_notes_touch BEFORE UPDATE ON public.crm_day_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();