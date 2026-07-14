
CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text, _business_code text DEFAULT NULL::text)
RETURNS TABLE(
  work_date date,
  clock_in timestamp with time zone,
  clock_out timestamp with time zone,
  break_start timestamp with time zone,
  break_end timestamp with time zone,
  break_minutes integer,
  total_hours numeric,
  net_hours numeric,
  crossed_midnight boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH emp AS (
    SELECT e.id
    FROM employees e
    LEFT JOIN businesses b ON b.business_code = _business_code
    WHERE e.employee_code = _employee_code
      AND e.active = true
      AND (_business_code IS NULL OR e.business_id = b.id)
    LIMIT 1
  ),
  ev AS (
    SELECT
      ce.event_type::text AS event_type,
      ce.timestamp AS ts,
      -- start a new session on each clock_in
      SUM(CASE WHEN ce.event_type = 'clock_in' THEN 1 ELSE 0 END)
        OVER (ORDER BY ce.timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_idx
    FROM clock_events ce
    WHERE ce.employee_id = (SELECT id FROM emp)
  ),
  sess AS (
    SELECT
      session_idx,
      MIN(CASE WHEN event_type = 'clock_in' THEN ts END) AS clock_in_t,
      MAX(CASE WHEN event_type = 'clock_out' THEN ts END) AS clock_out_t,
      MIN(CASE WHEN event_type = 'break_start' THEN ts END) AS first_break_start,
      MAX(CASE WHEN event_type = 'break_end' THEN ts END) AS last_break_end,
      COALESCE(SUM(
        CASE WHEN event_type = 'break_end' THEN EXTRACT(EPOCH FROM ts) / 60.0
             WHEN event_type = 'break_start' THEN -EXTRACT(EPOCH FROM ts) / 60.0
             ELSE 0 END
      ), 0) AS break_mins_raw
    FROM ev
    WHERE session_idx > 0
    GROUP BY session_idx
  )
  SELECT
    (s.clock_in_t AT TIME ZONE 'Australia/Sydney')::date AS work_date,
    s.clock_in_t AS clock_in,
    s.clock_out_t AS clock_out,
    s.first_break_start AS break_start,
    s.last_break_end AS break_end,
    GREATEST(0, ROUND(s.break_mins_raw))::int AS break_minutes,
    CASE
      WHEN s.clock_out_t IS NOT NULL THEN
        ROUND(EXTRACT(EPOCH FROM (s.clock_out_t - s.clock_in_t)) / 3600.0, 2)
      ELSE 0
    END AS total_hours,
    CASE
      WHEN s.clock_out_t IS NOT NULL THEN
        ROUND(
          (EXTRACT(EPOCH FROM (s.clock_out_t - s.clock_in_t)) / 3600.0)
          - (GREATEST(0, s.break_mins_raw) / 60.0),
          2
        )
      ELSE 0
    END AS net_hours,
    CASE
      WHEN s.clock_out_t IS NOT NULL
       AND (s.clock_in_t AT TIME ZONE 'Australia/Sydney')::date
         <> (s.clock_out_t AT TIME ZONE 'Australia/Sydney')::date
      THEN true ELSE false
    END AS crossed_midnight
  FROM sess s
  WHERE s.clock_in_t IS NOT NULL
  ORDER BY s.clock_in_t DESC;
$function$;

-- Keep the single-arg overload delegating to the two-arg version
CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text)
RETURNS TABLE(
  work_date date,
  clock_in timestamp with time zone,
  clock_out timestamp with time zone,
  break_start timestamp with time zone,
  break_end timestamp with time zone,
  break_minutes integer,
  total_hours numeric,
  net_hours numeric,
  crossed_midnight boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_employee_timesheets(_employee_code, NULL::text);
$function$;
