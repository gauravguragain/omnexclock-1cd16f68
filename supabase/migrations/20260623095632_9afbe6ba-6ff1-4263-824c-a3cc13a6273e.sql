
CREATE OR REPLACE FUNCTION public.get_employee_status(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(employee_id uuid, employee_name text, current_status text, last_event_time timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  emp_name TEXT;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT id INTO biz_id FROM businesses WHERE business_code = _business_code;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT id, name INTO emp_id, emp_name FROM employees WHERE employee_code = _employee_code AND active = true AND business_id = biz_id;
  ELSE
    SELECT id, name INTO emp_id, emp_name FROM employees WHERE employee_code = _employee_code AND active = true;
  END IF;

  IF emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT emp_id, emp_name,
    CASE
      WHEN ce.event_type = 'clock_in' THEN 'clocked_in'
      WHEN ce.event_type = 'clock_out' THEN 'clocked_out'
      WHEN ce.event_type = 'break_start' THEN 'on_break'
      WHEN ce.event_type = 'break_end' THEN 'clocked_in'
      ELSE 'clocked_out'
    END,
    ce.timestamp
  FROM clock_events ce
  WHERE ce.employee_id = emp_id
    -- Look back up to 36h so overnight shifts persist across midnight,
    -- but stale sessions from days ago auto-reset to clocked_out.
    AND ce.timestamp >= NOW() - INTERVAL '36 hours'
  ORDER BY ce.timestamp DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT emp_id, emp_name, 'clocked_out'::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$function$;
