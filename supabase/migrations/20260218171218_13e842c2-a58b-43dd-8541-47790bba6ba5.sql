
-- Update all employee RPCs to scope by business_code

CREATE OR REPLACE FUNCTION public.get_employee_status(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(employee_id uuid, employee_name text, current_status text, last_event_time timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  emp_name TEXT;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT id INTO biz_id FROM businesses WHERE business_code = _business_code;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT id, name INTO emp_id, emp_name FROM employees WHERE employee_code = _employee_code AND active = true AND business_id = biz_id;
  ELSE
    SELECT id, name INTO emp_id, emp_name FROM employees WHERE employee_code = _employee_code AND active = true;
  END IF;
  
  IF NOT FOUND THEN RETURN; END IF;
  
  RETURN QUERY
  SELECT emp_id, emp_name,
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
  ORDER BY ce.timestamp DESC LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT emp_id, emp_name, 'clocked_out'::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_shifts(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(id uuid, date date, day_of_week text, start_time time without time zone, end_time time without time zone, break_minutes integer, hours_worked numeric, notes text, week_start_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT s.id, s.date, s.day_of_week, s.start_time, s.end_time, s.break_minutes, s.hours_worked, s.notes, s.week_start_date
  FROM shifts s WHERE s.employee_id = emp_id AND s.status = 'published'
  ORDER BY s.date, s.start_time;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_timesheets(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(work_date date, clock_in timestamp with time zone, clock_out timestamp with time zone, break_start timestamp with time zone, break_end timestamp with time zone, break_minutes integer, total_hours numeric, net_hours numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  WITH daily_events AS (
    SELECT (ce.timestamp AT TIME ZONE 'Australia/Sydney')::date AS ev_date, ce.event_type, ce.timestamp AS ev_time
    FROM clock_events ce WHERE ce.employee_id = emp_id
  ),
  aggregated AS (
    SELECT de.ev_date,
      MIN(CASE WHEN de.event_type = 'clock_in' THEN de.ev_time END) AS first_clock_in,
      MAX(CASE WHEN de.event_type = 'clock_out' THEN de.ev_time END) AS last_clock_out,
      MIN(CASE WHEN de.event_type = 'break_start' THEN de.ev_time END) AS first_break_start,
      MAX(CASE WHEN de.event_type = 'break_end' THEN de.ev_time END) AS last_break_end
    FROM daily_events de GROUP BY de.ev_date
  )
  SELECT a.ev_date AS work_date, a.first_clock_in AS clock_in, a.last_clock_out AS clock_out,
    a.first_break_start AS break_start, a.last_break_end AS break_end,
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
  FROM aggregated a ORDER BY a.ev_date DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_clock_history(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(id uuid, event_type text, event_timestamp timestamp with time zone, photo_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT ce.id, ce.event_type::text, ce.timestamp, ce.photo_url
  FROM clock_events ce WHERE ce.employee_id = emp_id
    AND ce.timestamp >= (NOW() AT TIME ZONE 'Australia/Sydney')::date - INTERVAL '14 days'
  ORDER BY ce.timestamp DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_requests(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(id uuid, request_type text, status text, start_date date, end_date date, is_recurring boolean, recurring_days text[], recurring_start_date date, recurring_end_date date, reason text, admin_note text, created_at timestamp with time zone, start_time time without time zone, end_time time without time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT er.id, er.request_type, er.status, er.start_date, er.end_date, er.is_recurring, er.recurring_days, er.recurring_start_date, er.recurring_end_date, er.reason, er.admin_note, er.created_at, er.start_time, er.end_time
  FROM employee_requests er WHERE er.employee_id = emp_id ORDER BY er.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_employee_request(_employee_code text, _request_type text, _start_date date DEFAULT NULL, _end_date date DEFAULT NULL, _is_recurring boolean DEFAULT false, _recurring_days text[] DEFAULT NULL, _recurring_start_date date DEFAULT NULL, _recurring_end_date date DEFAULT NULL, _reason text DEFAULT NULL, _start_time time without time zone DEFAULT NULL, _end_time time without time zone DEFAULT NULL, _business_code text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO employee_requests (employee_id, request_type, start_date, end_date, is_recurring, recurring_days, recurring_start_date, recurring_end_date, reason, start_time, end_time)
  VALUES (emp_id, _request_type, _start_date, _end_date, _is_recurring, _recurring_days, _recurring_start_date, _recurring_end_date, _reason, _start_time, _end_time);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_employee_request(_employee_code text, _request_id uuid, _request_type text, _start_date date DEFAULT NULL, _end_date date DEFAULT NULL, _is_recurring boolean DEFAULT false, _recurring_days text[] DEFAULT NULL, _recurring_start_date date DEFAULT NULL, _recurring_end_date date DEFAULT NULL, _reason text DEFAULT NULL, _start_time time without time zone DEFAULT NULL, _end_time time without time zone DEFAULT NULL, _business_code text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE employee_requests
  SET request_type = _request_type, start_date = _start_date, end_date = _end_date,
      is_recurring = _is_recurring, recurring_days = _recurring_days, recurring_start_date = _recurring_start_date,
      recurring_end_date = _recurring_end_date, reason = _reason, start_time = _start_time, end_time = _end_time, updated_at = now()
  WHERE id = _request_id AND employee_id = emp_id AND status = 'pending';
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_employee_request(_employee_code text, _request_id uuid, _business_code text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  DELETE FROM employee_requests WHERE id = _request_id AND employee_id = emp_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_timesheet_approvals(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(approval_date date, is_approved boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT ta.date, ta.approved FROM timesheet_approvals ta WHERE ta.employee_id = emp_id ORDER BY ta.date DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_timesheet_history(_employee_code text, _date date, _business_code text DEFAULT NULL)
RETURNS TABLE(log_action text, log_timestamp timestamp with time zone, log_details jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  emp_name TEXT;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT e.id, e.name INTO emp_id, emp_name FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id, e.name INTO emp_id, emp_name FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT al.action, al.timestamp, al.details
  FROM audit_logs al
  WHERE al.action IN ('timesheet_edit', 'timesheet_add', 'timesheet_delete', 'timesheet_approve', 'timesheet_unapprove')
    AND al.details->>'employee_name' = emp_name
    AND (al.details->>'date' = _date::text)
  ORDER BY al.timestamp DESC;
END;
$function$;

-- Forum functions also need business scoping
CREATE OR REPLACE FUNCTION public.get_forum_posts(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(id uuid, title text, content text, created_at timestamp with time zone, comment_count bigint, reaction_counts jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT fp.id, fp.title, fp.content, fp.created_at,
    (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id) AS comment_count,
    COALESCE((SELECT jsonb_object_agg(r.reaction, r.cnt) FROM (SELECT fr.reaction, COUNT(*) AS cnt FROM forum_reactions fr WHERE fr.post_id = fp.id GROUP BY fr.reaction) r), '{}'::jsonb) AS reaction_counts
  FROM forum_posts fp
  WHERE (_business_code IS NULL OR fp.business_id = biz_id)
  ORDER BY fp.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_forum_comments(_employee_code text, _post_id uuid, _business_code text DEFAULT NULL)
RETURNS TABLE(id uuid, employee_name text, content text, created_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT fc.id, e2.name AS employee_name, fc.content, fc.created_at
  FROM forum_comments fc JOIN employees e2 ON e2.id = fc.employee_id
  WHERE fc.post_id = _post_id ORDER BY fc.created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_forum_comment(_employee_code text, _post_id uuid, _content text, _business_code text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO forum_comments (post_id, employee_id, content) VALUES (_post_id, emp_id, _content);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_forum_reaction(_employee_code text, _post_id uuid, _reaction text, _business_code text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  existing_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT fr.id INTO existing_id FROM forum_reactions fr WHERE fr.post_id = _post_id AND fr.employee_id = emp_id AND fr.reaction = _reaction;
  IF FOUND THEN
    DELETE FROM forum_reactions WHERE id = existing_id;
  ELSE
    INSERT INTO forum_reactions (post_id, employee_id, reaction) VALUES (_post_id, emp_id, _reaction);
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_reactions(_employee_code text, _post_id uuid, _business_code text DEFAULT NULL)
RETURNS TABLE(reaction text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  SELECT fr.reaction FROM forum_reactions fr WHERE fr.post_id = _post_id AND fr.employee_id = emp_id;
END;
$function$;
