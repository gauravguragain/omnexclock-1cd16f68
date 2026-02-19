CREATE POLICY "Admins can delete own business audit logs"
ON public.audit_logs
FOR DELETE
USING (is_admin_of_business(business_id));

CREATE POLICY "Super admins can delete own business audit logs"
ON public.audit_logs
FOR DELETE
USING (is_super_admin_of_business(business_id));