-- 1. Remove legacy portal functions that allowed lookups without a business code
DROP FUNCTION IF EXISTS public.get_employee_status(text);
DROP FUNCTION IF EXISTS public.get_employee_shifts(text);
DROP FUNCTION IF EXISTS public.get_employee_requests(text);
DROP FUNCTION IF EXISTS public.get_employee_clock_history(text);
DROP FUNCTION IF EXISTS public.get_employee_timesheet_approvals(text);
DROP FUNCTION IF EXISTS public.get_employee_timesheets(text);
DROP FUNCTION IF EXISTS public.get_forum_posts(text);
DROP FUNCTION IF EXISTS public.get_employee_timesheet_history(text, date);
DROP FUNCTION IF EXISTS public.get_forum_comments(text, uuid);
DROP FUNCTION IF EXISTS public.get_my_reactions(text, uuid);
DROP FUNCTION IF EXISTS public.add_forum_comment(text, uuid, text);
DROP FUNCTION IF EXISTS public.toggle_forum_reaction(text, uuid, text);
DROP FUNCTION IF EXISTS public.delete_employee_request(text, uuid);
DROP FUNCTION IF EXISTS public.submit_employee_request(text, text, date, date, boolean, text[], date, date, text, time without time zone, time without time zone);
DROP FUNCTION IF EXISTS public.update_employee_request(text, uuid, text, date, date, boolean, text[], date, date, text, time without time zone, time without time zone);

-- 2. Make _business_code mandatory on every remaining employee-scoped function
DO $do$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
      AND pg_get_functiondef(p.oid) LIKE '%IF _business_code IS NOT NULL THEN%'
  LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(
      d,
      'IF _business_code IS NOT NULL THEN',
      'IF _business_code IS NULL OR btrim(_business_code) = '''' THEN RAISE EXCEPTION ''business_code is required'' USING ERRCODE = ''22023''; END IF; IF TRUE THEN'
    );
    EXECUTE d;
  END LOOP;
END
$do$;

-- 3. Remove anonymous read access
DROP POLICY IF EXISTS "Anon can read approved requests" ON public.employee_requests;
DROP POLICY IF EXISTS "Anyone can read employee notifications" ON public.notifications;
DROP POLICY IF EXISTS "Employees can view own published shifts" ON public.shifts;

-- 4. Restrict "service role" insert/delete policies to service_role only
DROP POLICY IF EXISTS "Service role can insert requests" ON public.employee_requests;
CREATE POLICY "Service role can insert requests" ON public.employee_requests
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert status logs" ON public.catering_delivery_status_logs;
CREATE POLICY "Service role can insert status logs" ON public.catering_delivery_status_logs
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert forum comments" ON public.forum_comments;
CREATE POLICY "Service role can insert forum comments" ON public.forum_comments
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert forum reactions" ON public.forum_reactions;
CREATE POLICY "Service role can insert forum reactions" ON public.forum_reactions
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can delete forum reactions" ON public.forum_reactions;
CREATE POLICY "Service role can delete forum reactions" ON public.forum_reactions
  FOR DELETE TO service_role USING (true);

-- 5. Profiles: signed-in users only
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Master can update all profiles" ON public.profiles;
CREATE POLICY "Master can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (is_master()) WITH CHECK (is_master());
DROP POLICY IF EXISTS "Master can view all profiles" ON public.profiles;
CREATE POLICY "Master can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (is_master());
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 6. Drop blanket anonymous table privileges; portal traffic goes through SECURITY DEFINER RPCs
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.shifts FROM anon;
REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.employee_requests FROM anon;
REVOKE ALL ON public.forum_comments FROM anon;
REVOKE ALL ON public.forum_reactions FROM anon;
REVOKE ALL ON public.forum_posts FROM anon;
REVOKE ALL ON public.catering_delivery_status_logs FROM anon;
REVOKE ALL ON public.catering_deliveries FROM anon;
REVOKE ALL ON public.roster_day_events FROM anon;
REVOKE ALL ON public.invoices FROM anon;
REVOKE ALL ON public.employee_documents FROM anon;
REVOKE ALL ON public.clock_events FROM anon;
REVOKE ALL ON public.employees FROM anon;
REVOKE ALL ON public.businesses FROM anon;

-- 7. Public directory views run with the caller's own permissions
GRANT SELECT (id, business_code, name, logo_url, theme, status) ON public.businesses TO anon;
GRANT SELECT (id, employee_code, name, department, job_title, business_id, active) ON public.employees TO anon;

DROP POLICY IF EXISTS "Public can read business directory fields" ON public.businesses;
CREATE POLICY "Public can read business directory fields" ON public.businesses
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can read employee directory fields" ON public.employees;
CREATE POLICY "Public can read employee directory fields" ON public.employees
  FOR SELECT TO anon USING (active);

ALTER VIEW public.businesses_public SET (security_invoker = on);
ALTER VIEW public.employees_public SET (security_invoker = on);