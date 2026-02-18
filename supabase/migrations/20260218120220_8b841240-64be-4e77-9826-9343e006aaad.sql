
-- Update get_employee_timesheets to remove 14-day limit
CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text)
RETURNS TABLE(
  work_date date,
  clock_in timestamptz,
  clock_out timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  break_minutes int,
  total_hours numeric,
  net_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      DATE(ce.timestamp) AS ev_date,
      ce.event_type,
      ce.timestamp AS ev_time
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
  ),
  aggregated AS (
    SELECT
      ev_date,
      MIN(CASE WHEN event_type = 'clock_in' THEN ev_time END) AS first_clock_in,
      MAX(CASE WHEN event_type = 'clock_out' THEN ev_time END) AS last_clock_out,
      MIN(CASE WHEN event_type = 'break_start' THEN ev_time END) AS first_break_start,
      MAX(CASE WHEN event_type = 'break_end' THEN ev_time END) AS last_break_end
    FROM daily_events
    GROUP BY ev_date
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
$$;

-- Also update get_employee_shifts to remove the 7-day lookback limit
CREATE OR REPLACE FUNCTION public.get_employee_shifts(_employee_code text)
RETURNS TABLE(
  id uuid,
  date date,
  day_of_week text,
  start_time time,
  end_time time,
  break_minutes int,
  hours_worked numeric,
  notes text,
  week_start_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT s.id, s.date, s.day_of_week, s.start_time, s.end_time, s.break_minutes, s.hours_worked, s.notes, s.week_start_date
  FROM shifts s
  WHERE s.employee_id = emp_id
    AND s.status = 'published'
  ORDER BY s.date, s.start_time;
END;
$$;
