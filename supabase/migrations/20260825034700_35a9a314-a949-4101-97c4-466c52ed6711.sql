CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text, _business_code text DEFAULT NULL::text)
 RETURNS TABLE(work_date date, clock_in timestamp with time zone, clock_out timestamp with time zone, break_start timestamp with time zone, break_end timestamp with time zone, break_minutes integer, total_hours numeric, net_hours numeric, crossed_midnight boolean)
 LANGUAGE plpgsql
 STABLE
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

  FOR ev IN
    SELECT ce.event_type::text AS et, ce.timestamp AS ts
    FROM clock_events ce
    WHERE ce.employee_id = emp_id
    ORDER BY ce.timestamp ASC
  LOOP
    IF ev.et = 'clock_in' THEN
      IF s_open THEN
        -- previous session had no clock_out
        work_date := (s_clock_in AT TIME ZONE 'Australia/Sydney')::date;
        clock_in := s_clock_in; clock_out := NULL;
        break_start := s_first_break; break_end := s_last_break_end;
        break_minutes := GREATEST(0, ROUND(s_break_mins))::int;
        total_hours := 0; net_hours := 0; crossed_midnight := false;
        RETURN NEXT;
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
        t_hours := EXTRACT(EPOCH FROM (s_clock_out - s_clock_in)) / 3600.0;
        IF t_hours < 0 THEN t_hours := t_hours + 24; END IF;
        n_hours := GREATEST(0, t_hours - (b_mins / 60.0));

        work_date := (s_clock_in AT TIME ZONE 'Australia/Sydney')::date;
        clock_in := s_clock_in; clock_out := s_clock_out;
        break_start := s_first_break; break_end := s_last_break_end;
        break_minutes := b_mins;
        total_hours := ROUND(t_hours::numeric, 2);
        net_hours := ROUND(n_hours::numeric, 2);
        crossed_midnight := (s_clock_in AT TIME ZONE 'Australia/Sydney')::date
                            <> (s_clock_out AT TIME ZONE 'Australia/Sydney')::date;
        RETURN NEXT;

        s_open := false;
        s_clock_in := NULL; s_clock_out := NULL;
        s_first_break := NULL; s_last_break_end := NULL; s_cur_break := NULL;
        s_break_mins := 0;
      END IF;
      -- orphan clock_out (no matching clock_in) is intentionally discarded

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
    work_date := (s_clock_in AT TIME ZONE 'Australia/Sydney')::date;
    clock_in := s_clock_in; clock_out := NULL;
    break_start := s_first_break; break_end := s_last_break_end;
    break_minutes := b_mins;
    total_hours := 0; net_hours := 0; crossed_midnight := false;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$function$;