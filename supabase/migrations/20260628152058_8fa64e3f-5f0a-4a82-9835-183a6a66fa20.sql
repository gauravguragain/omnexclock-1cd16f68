CREATE OR REPLACE FUNCTION public.get_employee_timesheets(
  _employee_code text,
  _business_code text DEFAULT NULL::text
)
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  biz_id UUID;
  ev RECORD;
  session_idx INT := 0;
  current_open_idx INT := NULL;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _ts_sessions (
    idx INT,
    s_date DATE,
    clock_in_t TIMESTAMPTZ,
    clock_out_t TIMESTAMPTZ,
    first_break_start TIMESTAMPTZ,
    last_break_end TIMESTAMPTZ,
    current_break_start TIMESTAMPTZ,
    break_mins NUMERIC,
    is_open BOOLEAN
  ) ON COMMIT DROP;
  DELETE FROM _ts_sessions;

  FOR ev IN
    SELECT ce.event_type,
           ce.timestamp AS ev_time,
           (ce.timestamp AT TIME ZONE 'Australia/Sydney')::date AS ev_date
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
    ORDER BY ce.timestamp ASC
  LOOP
    IF ev.event_type = 'clock_in' THEN
      IF current_open_idx IS NOT NULL THEN
        UPDATE _ts_sessions s
        SET is_open = false
        WHERE s.idx = current_open_idx;
      END IF;

      session_idx := session_idx + 1;
      INSERT INTO _ts_sessions(idx, s_date, clock_in_t, break_mins, is_open)
      VALUES (session_idx, ev.ev_date, ev.ev_time, 0, true);
      current_open_idx := session_idx;

    ELSIF ev.event_type = 'clock_out' THEN
      IF current_open_idx IS NOT NULL THEN
        UPDATE _ts_sessions s
        SET clock_out_t = ev.ev_time,
            break_mins = s.break_mins + COALESCE(
              EXTRACT(EPOCH FROM (ev.ev_time - s.current_break_start)) / 60, 0
            ),
            last_break_end = CASE WHEN s.current_break_start IS NOT NULL THEN ev.ev_time ELSE s.last_break_end END,
            current_break_start = NULL,
            is_open = false
        WHERE s.idx = current_open_idx;
        current_open_idx := NULL;
      END IF;

    ELSIF ev.event_type = 'break_start' THEN
      IF current_open_idx IS NOT NULL THEN
        UPDATE _ts_sessions s
        SET current_break_start = ev.ev_time,
            first_break_start = COALESCE(s.first_break_start, ev.ev_time)
        WHERE s.idx = current_open_idx;
      END IF;

    ELSIF ev.event_type = 'break_end' THEN
      IF current_open_idx IS NOT NULL THEN
        UPDATE _ts_sessions s
        SET break_mins = s.break_mins + COALESCE(
              EXTRACT(EPOCH FROM (ev.ev_time - s.current_break_start)) / 60, 0
            ),
            last_break_end = ev.ev_time,
            current_break_start = NULL
        WHERE s.idx = current_open_idx;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    s.s_date AS work_date,
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
          ROUND(EXTRACT(EPOCH FROM (s.clock_out_t - s.clock_in_t))::numeric / 3600 - s.break_mins / 60, 2)
        ELSE 0
      END
    ) AS net_hours,
    (s.clock_in_t IS NOT NULL
     AND s.clock_out_t IS NOT NULL
     AND (s.clock_in_t AT TIME ZONE 'Australia/Sydney')::date
       <> (s.clock_out_t AT TIME ZONE 'Australia/Sydney')::date) AS crossed_midnight
  FROM _ts_sessions s
  WHERE s.clock_in_t IS NOT NULL
  ORDER BY s.s_date DESC, s.clock_in_t DESC NULLS LAST;
END;
$function$;

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