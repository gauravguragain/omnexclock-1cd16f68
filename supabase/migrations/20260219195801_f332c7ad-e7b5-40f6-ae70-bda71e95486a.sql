
-- ============================================================
-- FIX 1: Remove anonymous SELECT policies from event tables
-- ============================================================
DROP POLICY IF EXISTS "Anon can read event config" ON public.event_setup_config;
DROP POLICY IF EXISTS "Anon can read day events" ON public.roster_day_events;

-- ============================================================
-- FIX 2: Server-side audit logging with business access validation
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_audit_entry(
  _action TEXT,
  _details JSONB,
  _business_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate caller is authenticated
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Validate user has access to this business
  IF _business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND business_id = _business_id
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO audit_logs (user_id, action, details, business_id)
  VALUES (auth.uid(), _action, _details, _business_id);

  RETURN TRUE;
END;
$$;

-- ============================================================
-- FIX 4: Server-side employee deletion via RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_employee(_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_business_id UUID;
  emp_name TEXT;
  emp_code TEXT;
BEGIN
  -- Validate caller is authenticated
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get employee's business_id
  SELECT business_id, name, employee_code INTO emp_business_id, emp_name, emp_code
  FROM employees WHERE id = _employee_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check caller is admin of that business
  IF NOT is_admin_of_business(emp_business_id) THEN
    RETURN FALSE;
  END IF;

  -- Delete related records (CASCADE should handle most, but explicit for safety)
  DELETE FROM clock_events WHERE employee_id = _employee_id;
  DELETE FROM shifts WHERE employee_id = _employee_id;
  DELETE FROM employee_requests WHERE employee_id = _employee_id;
  DELETE FROM timesheet_approvals WHERE employee_id = _employee_id;
  DELETE FROM notifications WHERE employee_id = _employee_id;
  DELETE FROM forum_comments WHERE employee_id = _employee_id;
  DELETE FROM forum_reactions WHERE employee_id = _employee_id;
  DELETE FROM payroll_entries WHERE employee_id = _employee_id;
  
  -- Delete audit logs referencing this employee
  DELETE FROM audit_logs WHERE details->>'employee_id' = _employee_id::text;
  DELETE FROM audit_logs WHERE details->>'employee_name' = emp_name;

  -- Delete employee
  DELETE FROM employees WHERE id = _employee_id;

  -- Log the deletion
  INSERT INTO audit_logs (user_id, action, details, business_id)
  VALUES (auth.uid(), 'employee_delete', jsonb_build_object('employee_id', _employee_id, 'name', emp_name, 'employee_code', emp_code), emp_business_id);

  RETURN TRUE;
END;
$$;

-- ============================================================
-- FIX 5: Input validation on employee portal RPCs
-- ============================================================

-- add_forum_comment with validation
CREATE OR REPLACE FUNCTION public.add_forum_comment(
  _employee_code text, _post_id uuid, _content text, _business_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  -- Validate employee_code format
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN
    RETURN false;
  END IF;
  -- Validate content length
  IF _content IS NULL OR LENGTH(TRIM(_content)) = 0 OR LENGTH(_content) > 5000 THEN
    RETURN false;
  END IF;
  -- Validate business_code format
  IF _business_code IS NOT NULL AND _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN
    RETURN false;
  END IF;

  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO forum_comments (post_id, employee_id, content) VALUES (_post_id, emp_id, TRIM(_content));
  RETURN true;
END;
$$;

-- toggle_forum_reaction with validation
CREATE OR REPLACE FUNCTION public.toggle_forum_reaction(
  _employee_code text, _post_id uuid, _reaction text, _business_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  existing_id UUID;
  biz_id UUID;
BEGIN
  -- Validate inputs
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN
    RETURN false;
  END IF;
  IF _reaction IS NULL OR LENGTH(_reaction) = 0 OR LENGTH(_reaction) > 20 THEN
    RETURN false;
  END IF;
  IF _business_code IS NOT NULL AND _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN
    RETURN false;
  END IF;

  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT fr.id INTO existing_id FROM forum_reactions fr WHERE fr.post_id = _post_id AND fr.employee_id = emp_id AND fr.reaction = _reaction;
  IF FOUND THEN
    DELETE FROM forum_reactions WHERE id = existing_id;
  ELSE
    INSERT INTO forum_reactions (post_id, employee_id, reaction) VALUES (_post_id, emp_id, _reaction);
  END IF;
  RETURN true;
END;
$$;

-- submit_employee_request with validation
CREATE OR REPLACE FUNCTION public.submit_employee_request(
  _employee_code text, _request_type text, _start_date date DEFAULT NULL, _end_date date DEFAULT NULL,
  _is_recurring boolean DEFAULT false, _recurring_days text[] DEFAULT NULL, _recurring_start_date date DEFAULT NULL,
  _recurring_end_date date DEFAULT NULL, _reason text DEFAULT NULL, _start_time time DEFAULT NULL,
  _end_time time DEFAULT NULL, _business_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  -- Validate inputs
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN
    RETURN false;
  END IF;
  IF _request_type IS NULL OR LENGTH(_request_type) = 0 OR LENGTH(_request_type) > 50 THEN
    RETURN false;
  END IF;
  IF _reason IS NOT NULL AND LENGTH(_reason) > 1000 THEN
    RETURN false;
  END IF;
  IF _business_code IS NOT NULL AND _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN
    RETURN false;
  END IF;

  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO employee_requests (employee_id, request_type, start_date, end_date, is_recurring, recurring_days, recurring_start_date, recurring_end_date, reason, start_time, end_time)
  VALUES (emp_id, _request_type, _start_date, _end_date, _is_recurring, _recurring_days, _recurring_start_date, _recurring_end_date, _reason, _start_time, _end_time);
  RETURN true;
END;
$$;

-- update_employee_request with validation
CREATE OR REPLACE FUNCTION public.update_employee_request(
  _employee_code text, _request_id uuid, _request_type text, _start_date date DEFAULT NULL,
  _end_date date DEFAULT NULL, _is_recurring boolean DEFAULT false, _recurring_days text[] DEFAULT NULL,
  _recurring_start_date date DEFAULT NULL, _recurring_end_date date DEFAULT NULL, _reason text DEFAULT NULL,
  _start_time time DEFAULT NULL, _end_time time DEFAULT NULL, _business_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  -- Validate inputs
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN
    RETURN false;
  END IF;
  IF _request_type IS NULL OR LENGTH(_request_type) = 0 OR LENGTH(_request_type) > 50 THEN
    RETURN false;
  END IF;
  IF _reason IS NOT NULL AND LENGTH(_reason) > 1000 THEN
    RETURN false;
  END IF;
  IF _business_code IS NOT NULL AND _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN
    RETURN false;
  END IF;

  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE employee_requests
  SET request_type = _request_type, start_date = _start_date, end_date = _end_date,
      is_recurring = _is_recurring, recurring_days = _recurring_days, recurring_start_date = _recurring_start_date,
      recurring_end_date = _recurring_end_date, reason = _reason, start_time = _start_time, end_time = _end_time, updated_at = now()
  WHERE id = _request_id AND employee_id = emp_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

-- ============================================================
-- FIX 6: Make event-runsheets bucket private
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'event-runsheets';

DROP POLICY IF EXISTS "Anyone can view runsheets" ON storage.objects;

-- Authenticated business users can access runsheets
CREATE POLICY "Authenticated users can view runsheets"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'event-runsheets'
  AND auth.uid() IS NOT NULL
);
