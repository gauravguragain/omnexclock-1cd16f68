
-- Fix get_employee_timesheets to handle overnight shifts correctly
-- by attributing all events (clock_out, breaks) to the clock_in date

CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text, _business_code text DEFAULT NULL)
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
LANGUAGE plpgsql SECURITY DEFINER
AS $$
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
  WITH ordered_events AS (
    SELECT
      ce.event_type,
      ce.timestamp AS ev_time,
      (ce.timestamp AT TIME ZONE 'Australia/Sydney')::date AS ev_date
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
    ORDER BY ce.timestamp
  ),
  -- Assign a shift number based on clock_in events
  shift_assigned AS (
    SELECT oe.*,
      SUM(CASE WHEN oe.event_type = 'clock_in' THEN 1 ELSE 0 END) OVER (ORDER BY oe.ev_time) AS shift_num
    FROM ordered_events oe
  ),
  -- Get the clock_in date for each shift (attribute all events to clock_in date)
  shift_dates AS (
    SELECT sa.*,
      FIRST_VALUE(sa.ev_date) OVER (PARTITION BY sa.shift_num ORDER BY sa.ev_time) AS shift_date
    FROM shift_assigned sa
    WHERE sa.shift_num > 0
  ),
  aggregated AS (
    SELECT
      sd.shift_date AS ev_date,
      MIN(CASE WHEN sd.event_type = 'clock_in' THEN sd.ev_time END) AS first_clock_in,
      MAX(CASE WHEN sd.event_type = 'clock_out' THEN sd.ev_time END) AS last_clock_out,
      MIN(CASE WHEN sd.event_type = 'break_start' THEN sd.ev_time END) AS first_break_start,
      MAX(CASE WHEN sd.event_type = 'break_end' THEN sd.ev_time END) AS last_break_end
    FROM shift_dates sd
    GROUP BY sd.shift_date
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
$$;
