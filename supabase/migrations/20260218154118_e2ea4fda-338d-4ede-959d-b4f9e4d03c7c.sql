
-- RPC: get approval status for an employee's timesheets
CREATE OR REPLACE FUNCTION public.get_employee_timesheet_approvals(_employee_code text)
RETURNS TABLE(approval_date date, is_approved boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT ta.date, ta.approved
  FROM timesheet_approvals ta
  WHERE ta.employee_id = emp_id
  ORDER BY ta.date DESC;
END;
$$;

-- RPC: get edit history for an employee's timesheets from audit_logs
CREATE OR REPLACE FUNCTION public.get_employee_timesheet_history(_employee_code text, _date date)
RETURNS TABLE(log_action text, log_timestamp timestamptz, log_details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  emp_name TEXT;
BEGIN
  SELECT e.id, e.name INTO emp_id, emp_name FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT al.action, al.timestamp, al.details
  FROM audit_logs al
  WHERE al.action IN ('timesheet_edit', 'timesheet_add', 'timesheet_delete', 'timesheet_approve', 'timesheet_unapprove')
    AND al.details->>'employee_name' = emp_name
    AND (al.details->>'date' = _date::text)
  ORDER BY al.timestamp DESC;
END;
$$;
