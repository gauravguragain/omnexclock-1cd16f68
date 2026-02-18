
-- Create business-scoped admin check function
CREATE OR REPLACE FUNCTION public.is_admin_of_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin' AND business_id = _business_id
  )
$$;

-- Create business-scoped viewer check function
CREATE OR REPLACE FUNCTION public.is_viewer_of_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'viewer' AND business_id = _business_id
  )
$$;

-- Create function: is user admin or viewer of a business
CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = _business_id AND role IN ('admin', 'viewer')
  )
$$;

-- Helper: get business_id from employee_id
CREATE OR REPLACE FUNCTION public.get_employee_business_id(_employee_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT business_id FROM public.employees WHERE id = _employee_id
$$;

-- ============ UPDATE RLS POLICIES ============

-- EMPLOYEES: scope to business
DROP POLICY IF EXISTS "Admins can do everything with employees" ON public.employees;
CREATE POLICY "Admins can manage own business employees"
  ON public.employees FOR ALL TO authenticated
  USING (is_admin_of_business(business_id))
  WITH CHECK (is_admin_of_business(business_id));

DROP POLICY IF EXISTS "Viewers can view own business employees" ON public.employees;
CREATE POLICY "Viewers can view own business employees"
  ON public.employees FOR SELECT TO authenticated
  USING (has_business_access(business_id));

-- SHIFTS: scope via employee -> business
DROP POLICY IF EXISTS "Admins can manage shifts" ON public.shifts;
CREATE POLICY "Admins can manage own business shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (is_admin_of_business(get_employee_business_id(employee_id)))
  WITH CHECK (is_admin_of_business(get_employee_business_id(employee_id)));

-- CLOCK_EVENTS: scope via employee -> business
DROP POLICY IF EXISTS "Admins can view all clock events" ON public.clock_events;
CREATE POLICY "Admins can view own business clock events"
  ON public.clock_events FOR SELECT TO authenticated
  USING (has_business_access(get_employee_business_id(employee_id)));

DROP POLICY IF EXISTS "Admins can update clock events" ON public.clock_events;
CREATE POLICY "Admins can update own business clock events"
  ON public.clock_events FOR UPDATE TO authenticated
  USING (is_admin_of_business(get_employee_business_id(employee_id)));

DROP POLICY IF EXISTS "Admins can delete clock events" ON public.clock_events;
CREATE POLICY "Admins can delete own business clock events"
  ON public.clock_events FOR DELETE TO authenticated
  USING (is_admin_of_business(get_employee_business_id(employee_id)));

DROP POLICY IF EXISTS "Admins can insert clock events" ON public.clock_events;
CREATE POLICY "Admins can insert own business clock events"
  ON public.clock_events FOR INSERT TO authenticated
  WITH CHECK (is_admin_of_business(get_employee_business_id(employee_id)));

-- AUDIT_LOGS: scope to business
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view own business audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (has_business_access(business_id));

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can insert own business audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (is_admin_of_business(business_id));

-- EMPLOYEE_REQUESTS: scope via employee -> business
DROP POLICY IF EXISTS "Admins can manage employee requests" ON public.employee_requests;
CREATE POLICY "Admins can manage own business requests"
  ON public.employee_requests FOR ALL TO authenticated
  USING (is_admin_of_business(get_employee_business_id(employee_id)))
  WITH CHECK (is_admin_of_business(get_employee_business_id(employee_id)));

-- PAYROLL_ENTRIES: scope via employee -> business
DROP POLICY IF EXISTS "Admins can manage payroll entries" ON public.payroll_entries;
CREATE POLICY "Admins can manage own business payroll"
  ON public.payroll_entries FOR ALL TO authenticated
  USING (is_admin_of_business(get_employee_business_id(employee_id)))
  WITH CHECK (is_admin_of_business(get_employee_business_id(employee_id)));

-- TIMESHEET_APPROVALS: scope via employee -> business
DROP POLICY IF EXISTS "Admins can manage timesheet approvals" ON public.timesheet_approvals;
CREATE POLICY "Admins can manage own business timesheets"
  ON public.timesheet_approvals FOR ALL TO authenticated
  USING (is_admin_of_business(get_employee_business_id(employee_id)))
  WITH CHECK (is_admin_of_business(get_employee_business_id(employee_id)));

-- FORUM_POSTS: scope to business
DROP POLICY IF EXISTS "Admins can manage forum posts" ON public.forum_posts;
CREATE POLICY "Admins can manage own business forum posts"
  ON public.forum_posts FOR ALL TO authenticated
  USING (is_admin_of_business(business_id))
  WITH CHECK (is_admin_of_business(business_id));

-- FORUM_COMMENTS: scope via post -> business
DROP POLICY IF EXISTS "Admins can manage forum comments" ON public.forum_comments;
CREATE POLICY "Admins can manage own business forum comments"
  ON public.forum_comments FOR ALL TO authenticated
  USING (is_admin_of_business((SELECT fp.business_id FROM forum_posts fp WHERE fp.id = post_id)))
  WITH CHECK (is_admin_of_business((SELECT fp.business_id FROM forum_posts fp WHERE fp.id = post_id)));

-- FORUM_REACTIONS: scope via post -> business
DROP POLICY IF EXISTS "Admins can manage forum reactions" ON public.forum_reactions;
CREATE POLICY "Admins can manage own business forum reactions"
  ON public.forum_reactions FOR ALL TO authenticated
  USING (is_admin_of_business((SELECT fp.business_id FROM forum_posts fp WHERE fp.id = post_id)))
  WITH CHECK (is_admin_of_business((SELECT fp.business_id FROM forum_posts fp WHERE fp.id = post_id)));

-- USER_ROLES: scope to business
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can view own business roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (is_admin_of_business(business_id) OR user_id = auth.uid());

CREATE POLICY "Admins can manage own business roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (is_admin_of_business(business_id))
  WITH CHECK (is_admin_of_business(business_id));

-- PROFILES: keep existing policies (not business-scoped, that's fine)
