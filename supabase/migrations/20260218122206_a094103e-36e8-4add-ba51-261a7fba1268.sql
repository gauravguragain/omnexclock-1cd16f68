
-- Fix get_employee_timesheets to group by Australian date
CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text)
 RETURNS TABLE(work_date date, clock_in timestamp with time zone, clock_out timestamp with time zone, break_start timestamp with time zone, break_end timestamp with time zone, break_minutes integer, total_hours numeric, net_hours numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id
  FROM employees e
  WHERE e.employee_code = _employee_code AND e.active = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH daily_events AS (
    SELECT
      (ce.timestamp AT TIME ZONE 'Australia/Sydney')::date AS ev_date,
      ce.event_type,
      ce.timestamp AS ev_time
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
  ),
  aggregated AS (
    SELECT
      de.ev_date,
      MIN(CASE WHEN de.event_type = 'clock_in' THEN de.ev_time END) AS first_clock_in,
      MAX(CASE WHEN de.event_type = 'clock_out' THEN de.ev_time END) AS last_clock_out,
      MIN(CASE WHEN de.event_type = 'break_start' THEN de.ev_time END) AS first_break_start,
      MAX(CASE WHEN de.event_type = 'break_end' THEN de.ev_time END) AS last_break_end
    FROM daily_events de
    GROUP BY de.ev_date
  )
  SELECT
    a.ev_date AS work_date,
    a.first_clock_in AS clock_in,
    a.last_clock_out AS clock_out,
    a.first_break_start AS break_start,
    a.last_break_end AS break_end,
    CASE
      WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
      THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::int / 60
      ELSE 0
    END AS break_minutes,
    CASE
      WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600, 2)
      ELSE 0
    END AS total_hours,
    CASE
      WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
      THEN GREATEST(0, ROUND(
        (EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600) -
        (CASE WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::numeric / 3600
          ELSE 0 END)
      , 2))
      ELSE 0
    END AS net_hours
  FROM aggregated a
  ORDER BY a.ev_date DESC;
END;
$function$;

-- Fix get_employee_status to use Australian date for "today"
CREATE OR REPLACE FUNCTION public.get_employee_status(_employee_code text)
 RETURNS TABLE(employee_id uuid, employee_name text, current_status text, last_event_time timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  emp_name TEXT;
BEGIN
  SELECT id, name INTO emp_id, emp_name 
  FROM employees 
  WHERE employee_code = _employee_code AND active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    emp_id,
    emp_name,
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
    AND (ce.timestamp AT TIME ZONE 'Australia/Sydney')::date = (NOW() AT TIME ZONE 'Australia/Sydney')::date
  ORDER BY ce.timestamp DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT emp_id, emp_name, 'clocked_out'::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$function$;

-- Fix get_employee_clock_history to use Australian timezone
CREATE OR REPLACE FUNCTION public.get_employee_clock_history(_employee_code text)
 RETURNS TABLE(id uuid, event_type text, event_timestamp timestamp with time zone, photo_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id
  FROM employees e
  WHERE e.employee_code = _employee_code AND e.active = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ce.id, ce.event_type::text, ce.timestamp, ce.photo_url
  FROM clock_events ce
  WHERE ce.employee_id = emp_id
    AND ce.timestamp >= (NOW() AT TIME ZONE 'Australia/Sydney')::date - INTERVAL '14 days'
  ORDER BY ce.timestamp DESC;
END;
$function$;
