
-- Drop and recreate get_employee_requests with new return type
DROP FUNCTION IF EXISTS public.get_employee_requests(text);

CREATE OR REPLACE FUNCTION public.get_employee_requests(_employee_code text)
 RETURNS TABLE(id uuid, request_type text, status text, start_date date, end_date date, is_recurring boolean, recurring_days text[], recurring_start_date date, recurring_end_date date, reason text, admin_note text, created_at timestamp with time zone, start_time time without time zone, end_time time without time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT er.id, er.request_type, er.status, er.start_date, er.end_date, er.is_recurring, er.recurring_days, er.recurring_start_date, er.recurring_end_date, er.reason, er.admin_note, er.created_at, er.start_time, er.end_time
  FROM employee_requests er
  WHERE er.employee_id = emp_id
  ORDER BY er.created_at DESC;
END;
$function$;

-- Drop and recreate submit_employee_request with time fields
DROP FUNCTION IF EXISTS public.submit_employee_request(text, text, date, date, boolean, text[], date, date, text);

CREATE OR REPLACE FUNCTION public.submit_employee_request(
  _employee_code text,
  _request_type text,
  _start_date date DEFAULT NULL,
  _end_date date DEFAULT NULL,
  _is_recurring boolean DEFAULT false,
  _recurring_days text[] DEFAULT NULL,
  _recurring_start_date date DEFAULT NULL,
  _recurring_end_date date DEFAULT NULL,
  _reason text DEFAULT NULL,
  _start_time time DEFAULT NULL,
  _end_time time DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO employee_requests (employee_id, request_type, start_date, end_date, is_recurring, recurring_days, recurring_start_date, recurring_end_date, reason, start_time, end_time)
  VALUES (emp_id, _request_type, _start_date, _end_date, _is_recurring, _recurring_days, _recurring_start_date, _recurring_end_date, _reason, _start_time, _end_time);
  RETURN true;
END;
$function$;
