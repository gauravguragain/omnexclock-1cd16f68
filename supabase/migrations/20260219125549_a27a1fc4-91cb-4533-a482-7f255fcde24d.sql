
-- Helper functions for roster_admin
CREATE OR REPLACE FUNCTION public.is_roster_admin_of_business(_business_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'roster_admin' AND business_id = _business_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_roster_admin_departments(_business_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT departments FROM public.user_roles
  WHERE user_id = auth.uid() AND role = 'roster_admin' AND business_id = _business_id
  LIMIT 1
$$;

-- Update has_business_access to include roster_admin
CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = _business_id AND role IN ('admin', 'viewer', 'roster_admin')
  )
$$;

-- RLS: Roster admins can manage department shifts
CREATE POLICY "Roster admins can manage department shifts"
ON public.shifts FOR ALL
USING (
  is_roster_admin_of_business(get_employee_business_id(employee_id))
  AND (SELECT department FROM employees WHERE id = employee_id) = ANY(get_roster_admin_departments(get_employee_business_id(employee_id)))
)
WITH CHECK (
  is_roster_admin_of_business(get_employee_business_id(employee_id))
  AND (SELECT department FROM employees WHERE id = employee_id) = ANY(get_roster_admin_departments(get_employee_business_id(employee_id)))
);

-- RLS: Roster admins can manage department timesheets
CREATE POLICY "Roster admins can manage department timesheets"
ON public.timesheet_approvals FOR ALL
USING (
  is_roster_admin_of_business(get_employee_business_id(employee_id))
  AND (SELECT department FROM employees WHERE id = employee_id) = ANY(get_roster_admin_departments(get_employee_business_id(employee_id)))
)
WITH CHECK (
  is_roster_admin_of_business(get_employee_business_id(employee_id))
  AND (SELECT department FROM employees WHERE id = employee_id) = ANY(get_roster_admin_departments(get_employee_business_id(employee_id)))
);

-- RLS: Roster admins can view department employees
CREATE POLICY "Roster admins can view department employees"
ON public.employees FOR SELECT
USING (
  is_roster_admin_of_business(business_id)
  AND department = ANY(get_roster_admin_departments(business_id))
);

-- RLS: Roster admins can view department clock events
CREATE POLICY "Roster admins can view department clock events"
ON public.clock_events FOR SELECT
USING (
  is_roster_admin_of_business(get_employee_business_id(employee_id))
  AND (SELECT department FROM employees WHERE id = employee_id) = ANY(get_roster_admin_departments(get_employee_business_id(employee_id)))
);

-- RLS: Roster admins audit log access
CREATE POLICY "Roster admins can view own business audit logs"
ON public.audit_logs FOR SELECT
USING (is_roster_admin_of_business(business_id));

CREATE POLICY "Roster admins can insert own business audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (is_roster_admin_of_business(business_id));

-- RLS: Roster admins event config read
CREATE POLICY "Roster admins can view event config"
ON public.event_setup_config FOR SELECT
USING (is_roster_admin_of_business(business_id));

-- RLS: Roster admins day events management
CREATE POLICY "Roster admins can manage day events"
ON public.roster_day_events FOR ALL
USING (is_roster_admin_of_business(business_id))
WITH CHECK (is_roster_admin_of_business(business_id));

-- RLS: Roster admins notifications
CREATE POLICY "Roster admins can view own notifications"
ON public.notifications FOR SELECT
USING (is_roster_admin_of_business(business_id) AND user_id = auth.uid());

CREATE POLICY "Roster admins can update own notifications"
ON public.notifications FOR UPDATE
USING (is_roster_admin_of_business(business_id) AND user_id = auth.uid());
