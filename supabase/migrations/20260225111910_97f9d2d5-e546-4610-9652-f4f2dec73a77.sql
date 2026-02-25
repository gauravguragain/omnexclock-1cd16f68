
-- Add overnight shift handling (totalHours < 0 → add 24) to match admin page logic

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
  ),
  computed AS (
    SELECT
      a.ev_date,
      a.first_clock_in,
      a.last_clock_out,
      a.first_break_start,
      a.last_break_end,
      CASE WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
        THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::int / 60 ELSE 0 END AS brk_mins,
      CASE WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
        THEN CASE 
          WHEN EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600 < 0
          THEN ROUND(EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600 + 24, 2)
          ELSE ROUND(EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600, 2)
        END
        ELSE 0 END AS raw_total
    FROM aggregated a
  )
  SELECT
    c.ev_date AS work_date,
    c.first_clock_in AS clock_in,
    c.last_clock_out AS clock_out,
    c.first_break_start AS break_start,
    c.last_break_end AS break_end,
    c.brk_mins AS break_minutes,
    c.raw_total AS total_hours,
    GREATEST(0, ROUND(c.raw_total - c.brk_mins::numeric / 60, 2)) AS net_hours
  FROM computed c
  ORDER BY c.ev_date DESC;
END;
$function$;

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
  ),
  computed AS (
    SELECT
      a.ev_date,
      a.first_clock_in,
      a.last_clock_out,
      a.first_break_start,
      a.last_break_end,
      CASE WHEN a.first_break_start IS NOT NULL AND a.last_break_end IS NOT NULL
        THEN EXTRACT(EPOCH FROM (a.last_break_end - a.first_break_start))::int / 60 ELSE 0 END AS brk_mins,
      CASE WHEN a.first_clock_in IS NOT NULL AND a.last_clock_out IS NOT NULL
        THEN CASE 
          WHEN EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600 < 0
          THEN ROUND(EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600 + 24, 2)
          ELSE ROUND(EXTRACT(EPOCH FROM (a.last_clock_out - a.first_clock_in))::numeric / 3600, 2)
        END
        ELSE 0 END AS raw_total
    FROM aggregated a
  )
  SELECT
    c.ev_date AS work_date,
    c.first_clock_in AS clock_in,
    c.last_clock_out AS clock_out,
    c.first_break_start AS break_start,
    c.last_break_end AS break_end,
    c.brk_mins AS break_minutes,
    c.raw_total AS total_hours,
    GREATEST(0, ROUND(c.raw_total - c.brk_mins::numeric / 60, 2)) AS net_hours
  FROM computed c
  ORDER BY c.ev_date DESC;
END;
$function$;
