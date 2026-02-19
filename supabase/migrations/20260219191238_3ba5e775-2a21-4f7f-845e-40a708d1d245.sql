CREATE POLICY "Viewers can view own business timesheet approvals"
ON public.timesheet_approvals
FOR SELECT
USING (has_business_access(get_employee_business_id(employee_id)));