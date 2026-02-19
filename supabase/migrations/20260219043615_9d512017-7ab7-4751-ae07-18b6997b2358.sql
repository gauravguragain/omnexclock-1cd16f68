
-- Master can view all audit logs
CREATE POLICY "Master can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (is_master());

-- Master can view all employees
CREATE POLICY "Master can view all employees"
ON public.employees
FOR SELECT
USING (is_master());

-- Master can view all clock events
CREATE POLICY "Master can view all clock events"
ON public.clock_events
FOR SELECT
USING (is_master());
