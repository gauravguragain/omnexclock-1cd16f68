
-- RPC: Get published shifts for an employee by code (current + next week)
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
    AND s.date >= CURRENT_DATE - INTERVAL '7 days'
  ORDER BY s.date, s.start_time;
END;
$$;

-- RPC: Get recent clock events for an employee by code (last 14 days)
CREATE OR REPLACE FUNCTION public.get_employee_clock_history(_employee_code text)
RETURNS TABLE(
  id uuid,
  event_type text,
  event_timestamp timestamptz,
  photo_url text
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
  SELECT ce.id, ce.event_type::text, ce.timestamp, ce.photo_url
  FROM clock_events ce
  WHERE ce.employee_id = emp_id
    AND ce.timestamp >= CURRENT_DATE - INTERVAL '14 days'
  ORDER BY ce.timestamp DESC;
END;
$$;
