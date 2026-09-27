CREATE TABLE public.ops_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_report_templates TO authenticated;
GRANT ALL ON public.ops_report_templates TO service_role;
ALTER TABLE public.ops_report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage report templates" ON public.ops_report_templates
  FOR ALL TO authenticated
  USING (public.is_owner_of_business(auth.uid(), business_id) OR public.is_master())
  WITH CHECK (public.is_owner_of_business(auth.uid(), business_id) OR public.is_master());
CREATE TRIGGER ops_report_templates_touch BEFORE UPDATE ON public.ops_report_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();