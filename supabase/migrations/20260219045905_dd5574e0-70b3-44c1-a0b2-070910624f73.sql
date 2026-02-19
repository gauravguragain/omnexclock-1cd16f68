
-- Create master audit logs table (separate from business audit logs for privacy)
CREATE TABLE public.master_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.master_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master can view master audit logs"
  ON public.master_audit_logs FOR SELECT
  USING (is_master());

CREATE POLICY "Master can insert master audit logs"
  ON public.master_audit_logs FOR INSERT
  WITH CHECK (is_master());
