
-- RPC for employees to delete their own requests (any status)
CREATE OR REPLACE FUNCTION public.delete_employee_request(_employee_code text, _request_id uuid)
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

  DELETE FROM employee_requests WHERE id = _request_id AND employee_id = emp_id;
  RETURN FOUND;
END;
$function$;

-- RPC for employees to update their own pending requests
CREATE OR REPLACE FUNCTION public.update_employee_request(
  _employee_code text,
  _request_id uuid,
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

  UPDATE employee_requests
  SET request_type = _request_type,
      start_date = _start_date,
      end_date = _end_date,
      is_recurring = _is_recurring,
      recurring_days = _recurring_days,
      recurring_start_date = _recurring_start_date,
      recurring_end_date = _recurring_end_date,
      reason = _reason,
      start_time = _start_time,
      end_time = _end_time,
      updated_at = now()
  WHERE id = _request_id AND employee_id = emp_id AND status = 'pending';
  RETURN FOUND;
END;
$function$;
