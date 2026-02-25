
-- Update both overloads of get_employee_timesheets to use date-based grouping
-- (matching admin page logic) instead of shift-based grouping

CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text, _business_code text DEFAULT NULL::text)
 RETURNS TABLE(work_date date, clock_in timestamp with time zone, clock_out timestamp with time zone, break_start timestamp with time zone, break_end timestamp with time zone, break_minutes integer, total_hours numeric, net_hours numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  WITH events_with_date AS (
    SELECT
      ce.event_type,
      ce.timestamp AS ev_time,
      (ce.timestamp AT TIME ZONE 'Australia/Sydney')::date AS ev_date
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
  ),
  aggregated AS (
    SELECT
      e.ev_date,
      MIN(CASE WHEN e.event_type = 'clock_in' THEN e.ev_time END) AS first_clock_in,
      MAX(CASE WHEN e.event_type = 'clock_out' THEN e.ev_time END) AS last_clock_out,
      MIN(CASE WHEN e.event_type = 'break_start' THEN e.ev_time END) AS first_break_start,
      MAX(CASE WHEN e.event_type = 'break_end' THEN e.ev_time END) AS last_break_end
    FROM events_with_date e
    GROUP BY e.ev_date
  )
  SELECT
    a.ev_date AS work_date,
    a.first_clock_in AS clock_in,
    a.last_clock_out AS clock_out,
    a.first_break_start AS break_start,
    a.last_break_end AS break_end,
    CASE WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
      THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::int / 60 ELSE 0 END AS break_minutes,
    CASE WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600, 2) ELSE 0 END AS total_hours,
    CASE WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
      THEN GREATEST(0, ROUND(
        (EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600) -
        (CASE WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::numeric / 3600 ELSE 0 END), 2))
      ELSE 0 END AS net_hours
  FROM aggregated a
  ORDER BY a.ev_date DESC;
END;
$function$;

-- Also update the single-arg overload
CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text)
 RETURNS TABLE(work_date date, clock_in timestamp with time zone, clock_out timestamp with time zone, break_start timestamp with time zone, break_end timestamp with time zone, break_minutes integer, total_hours numeric, net_hours numeric)
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
  WITH events_with_date AS (
    SELECT
      ce.event_type,
      ce.timestamp AS ev_time,
      (ce.timestamp AT TIME ZONE 'Australia/Sydney')::date AS ev_date
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
  ),
  aggregated AS (
    SELECT
      e.ev_date,
      MIN(CASE WHEN e.event_type = 'clock_in' THEN e.ev_time END) AS first_clock_in,
      MAX(CASE WHEN e.event_type = 'clock_out' THEN e.ev_time END) AS last_clock_out,
      MIN(CASE WHEN e.event_type = 'break_start' THEN e.ev_time END) AS first_break_start,
      MAX(CASE WHEN e.event_type = 'break_end' THEN e.ev_time END) AS last_break_end
    FROM events_with_date e
    GROUP BY e.ev_date
  )
  SELECT
    a.ev_date AS work_date,
    a.first_clock_in AS clock_in,
    a.last_clock_out AS clock_out,
    a.first_break_start AS break_start,
    a.last_break_end AS break_end,
    CASE WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
      THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::int / 60 ELSE 0 END AS break_minutes,
    CASE WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600, 2) ELSE 0 END AS total_hours,
    CASE WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
      THEN GREATEST(0, ROUND(
        (EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600) -
        (CASE WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::numeric / 3600 ELSE 0 END), 2))
      ELSE 0 END AS net_hours
  FROM aggregated a
  ORDER BY a.ev_date DESC;
END;
$function$;
