
-- Allow any authenticated user to insert into master_audit_logs (for sign-in tracking etc.)
DROP POLICY IF EXISTS "Master can insert master audit logs" ON public.master_audit_logs;

CREATE POLICY "Authenticated can insert master audit logs"
ON public.master_audit_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);
