CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text, _business_code text DEFAULT NULL::text)
 RETURNS TABLE(work_date date, clock_in timestamp with time zone, clock_out timestamp with time zone, break_start timestamp with time zone, break_end timestamp with time zone, break_minutes integer, total_hours numeric, net_hours numeric, crossed_midnight boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_id uuid;
  ev record;
  s_clock_in timestamptz;
  s_clock_out timestamptz;
  s_first_break timestamptz;
  s_last_break_end timestamptz;
  s_cur_break timestamptz;
  s_break_mins numeric := 0;
  s_open boolean := false;
  b_mins int;
  t_hours numeric;
  n_hours numeric;
BEGIN
  SELECT e.id INTO emp_id
  FROM employees e
  LEFT JOIN businesses b ON b.business_code = _business_code
  WHERE e.employee_code = _employee_code
    AND e.active = true
    AND (_business_code IS NULL OR e.business_id = b.id)
  LIMIT 1;

  IF emp_id IS NULL THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _ts_out (
    work_date date, clock_in timestamptz, clock_out timestamptz,
    break_start timestamptz, break_end timestamptz, break_minutes int,
    total_hours numeric, net_hours numeric, crossed_midnight boolean
  ) ON COMMIT DROP;
  DELETE FROM _ts_out;

  FOR ev IN
    SELECT ce.event_type::text AS et, ce.timestamp AS ts
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
    ORDER BY ce.timestamp ASC
  LOOP
    IF ev.et = 'clock_in' THEN
      IF s_open THEN
        -- close previous open session without clock_out
        b_mins := GREATEST(0, ROUND(s_break_mins))::int;
        INSERT INTO _ts_out VALUES (
          (s_clock_in AT TIME ZONE 'Australia/Sydney')::date,
          s_clock_in, NULL, s_first_break, s_last_break_end, b_mins, 0, 0, false
        );
      END IF;
      s_open := true;
      s_clock_in := ev.ts; s_clock_out := NULL;
      s_first_break := NULL; s_last_break_end := NULL; s_cur_break := NULL;
      s_break_mins := 0;

    ELSIF ev.et = 'clock_out' THEN
      IF s_open THEN
        s_clock_out := ev.ts;
        IF s_cur_break IS NOT NULL THEN
          s_break_mins := s_break_mins + EXTRACT(EPOCH FROM (ev.ts - s_cur_break)) / 60.0;
          s_last_break_end := ev.ts;
          s_cur_break := NULL;
        END IF;
        b_mins := GREATEST(0, ROUND(s_break_mins))::int;
        t_hours := ROUND(EXTRACT(EPOCH FROM (s_clock_out - s_clock_in)) / 3600.0, 2);
        IF t_hours < 0 THEN t_hours := t_hours + 24; END IF;
        n_hours := GREATEST(0, ROUND(t_hours - (b_mins / 60.0), 2));
        INSERT INTO _ts_out VALUES (
          (s_clock_in AT TIME ZONE 'Australia/Sydney')::date,
          s_clock_in, s_clock_out, s_first_break, s_last_break_end, b_mins,
          t_hours, n_hours,
          (s_clock_in AT TIME ZONE 'Australia/Sydney')::date
            <> (s_clock_out AT TIME ZONE 'Australia/Sydney')::date
        );
        s_open := false;
      END IF;
      -- orphan clock_out is ignored (matches admin view)

    ELSIF ev.et = 'break_start' THEN
      IF s_open THEN
        s_cur_break := ev.ts;
        IF s_first_break IS NULL THEN s_first_break := ev.ts; END IF;
      END IF;

    ELSIF ev.et = 'break_end' THEN
      IF s_open AND s_cur_break IS NOT NULL THEN
        s_break_mins := s_break_mins + EXTRACT(EPOCH FROM (ev.ts - s_cur_break)) / 60.0;
        s_last_break_end := ev.ts;
        s_cur_break := NULL;
      END IF;
    END IF;
  END LOOP;

  IF s_open THEN
    b_mins := GREATEST(0, ROUND(s_break_mins))::int;
    INSERT INTO _ts_out VALUES (
      (s_clock_in AT TIME ZONE 'Australia/Sydney')::date,
      s_clock_in, NULL, s_first_break, s_last_break_end, b_mins, 0, 0, false
    );
  END IF;

  RETURN QUERY SELECT * FROM _ts_out ORDER BY _ts_out.clock_in DESC;
END;
$function$;