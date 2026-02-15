
-- 1. Remove anonymous read access to clock_events
DROP POLICY IF EXISTS "Anon can read clock events" ON public.clock_events;

-- 2. Create security definer function for kiosk status lookup
CREATE OR REPLACE FUNCTION public.get_employee_status(_employee_code TEXT)
RETURNS TABLE(employee_id UUID, employee_name TEXT, current_status TEXT, last_event_time TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_id UUID;
  emp_name TEXT;
BEGIN
  SELECT id, name INTO emp_id, emp_name 
  FROM employees 
  WHERE employee_code = _employee_code AND active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    emp_id,
    emp_name,
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
    AND DATE(ce.timestamp) = CURRENT_DATE
  ORDER BY ce.timestamp DESC
  LIMIT 1;
  
  -- If no events today, return clocked_out
  IF NOT FOUND THEN
    RETURN QUERY SELECT emp_id, emp_name, 'clocked_out'::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$$;

-- 3. Make clock-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'clock-photos';

-- 4. Remove anonymous storage policies
DROP POLICY IF EXISTS "Anyone can upload clock photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view clock photos" ON storage.objects;

-- 5. Add admin-only view and service role upload policies for clock-photos
CREATE POLICY "Admins can view clock photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'clock-photos' AND public.is_admin());

CREATE POLICY "Service role can upload clock photos"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'clock-photos');

CREATE POLICY "Service role can read clock photos"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'clock-photos');
