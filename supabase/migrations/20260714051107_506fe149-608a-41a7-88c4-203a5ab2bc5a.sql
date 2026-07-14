CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text, _business_code text DEFAULT NULL::text)
RETURNS TABLE(work_date date, clock_in timestamp with time zone, clock_out timestamp with time zone, break_start timestamp with time zone, break_end timestamp with time zone, break_minutes integer, total_hours numeric, net_hours numeric, crossed_midnight boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF emp_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH ev AS (
    SELECT
      ce.event_type::text AS event_type,
      ce.timestamp AS ts,
      SUM(CASE WHEN ce.event_type = 'clock_in' THEN 1 ELSE 0 END)
        OVER (ORDER BY ce.timestamp, ce.id) AS sess
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
  ),
  ev2 AS (
    SELECT
      event_type, ts, sess,
      LAG(event_type) OVER (PARTITION BY sess ORDER BY ts) AS prev_type,
      LAG(ts)         OVER (PARTITION BY sess ORDER BY ts) AS prev_ts
    FROM ev
    WHERE sess > 0
  ),
  sessions AS (
    SELECT
      sess,
      MIN(ts) FILTER (WHERE event_type = 'clock_in')     AS clock_in_t,
      MAX(ts) FILTER (WHERE event_type = 'clock_out')    AS clock_out_t,
      MIN(ts) FILTER (WHERE event_type = 'break_start')  AS first_break_start,
      MAX(ts) FILTER (WHERE event_type = 'break_end')    AS last_break_end,
      COALESCE(SUM(
        CASE
          WHEN event_type IN ('break_end', 'clock_out') AND prev_type = 'break_start'
            THEN EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0
          ELSE 0
        END
      ), 0) AS break_mins
    FROM ev2
    GROUP BY sess
  )
  SELECT
    (s.clock_in_t AT TIME ZONE 'Australia/Sydney')::date AS work_date,
    s.clock_in_t AS clock_in,
    s.clock_out_t AS clock_out,
    s.first_break_start AS break_start,
    s.last_break_end AS break_end,
    ROUND(s.break_mins)::int AS break_minutes,
    CASE
      WHEN s.clock_in_t IS NOT NULL AND s.clock_out_t IS NOT NULL THEN
        ROUND(EXTRACT(EPOCH FROM (s.clock_out_t - s.clock_in_t))::numeric / 3600, 2)
      ELSE 0
    END AS total_hours,
    GREATEST(0,
      CASE
        WHEN s.clock_in_t IS NOT NULL AND s.clock_out_t IS NOT NULL THEN
          ROUND(EXTRACT(EPOCH FROM (s.clock_out_t - s.clock_in_t))::numeric / 3600 - s.break_mins / 60.0, 2)
        ELSE 0
      END
    ) AS net_hours,
    (s.clock_in_t IS NOT NULL
      AND s.clock_out_t IS NOT NULL
      AND (s.clock_in_t  AT TIME ZONE 'Australia/Sydney')::date
        <> (s.clock_out_t AT TIME ZONE 'Australia/Sydney')::date) AS crossed_midnight
  FROM sessions s
  WHERE s.clock_in_t IS NOT NULL
  ORDER BY (s.clock_in_t AT TIME ZONE 'Australia/Sydney')::date DESC, s.clock_in_t DESC;
END;
$function$;