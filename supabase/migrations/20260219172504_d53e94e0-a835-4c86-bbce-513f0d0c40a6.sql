-- Add banquet_tier column
ALTER TABLE public.roster_day_events ADD COLUMN IF NOT EXISTS banquet_tier text DEFAULT NULL;

-- Drop existing function signatures to allow return type change
DROP FUNCTION IF EXISTS public.get_employee_day_events(text, text);

-- Recreate with banquet_tier in return
CREATE OR REPLACE FUNCTION public.get_employee_day_events(_employee_code text, _business_code text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, date date, event_space text, event_type text, num_tables integer, chairs_per_table integer, tablecloth_color text, cold_sparkles boolean, dry_ice boolean, red_carpet boolean, decor_access boolean, notes text, adult_guests integer, kids_guests integer, smoke_machine boolean, live_stall boolean, live_stall_details text, host_name text, host_contact_number text, bev_package text, event_time text, runsheet_url text, banquet_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_id UUID;
  biz_id UUID;
  emp_job_title TEXT;
  is_supervisor_or_manager BOOLEAN;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT e.id, e.job_title INTO emp_id, emp_job_title FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id, e.job_title INTO emp_id, emp_job_title FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
    SELECT e.business_id INTO biz_id FROM employees e WHERE e.id = emp_id;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  is_supervisor_or_manager := LOWER(COALESCE(emp_job_title, '')) IN ('supervisor', 'manager');

  IF is_supervisor_or_manager THEN
    RETURN QUERY
    SELECT rde.id, rde.date, rde.event_space, rde.event_type,
      rde.num_tables, rde.chairs_per_table, rde.tablecloth_color,
      rde.cold_sparkles, rde.dry_ice, rde.red_carpet,
      rde.decor_access, rde.notes, rde.adult_guests, rde.kids_guests,
      rde.smoke_machine, rde.live_stall, rde.live_stall_details,
      rde.host_name, rde.host_contact_number, rde.bev_package, rde.event_time,
      rde.runsheet_url, rde.banquet_tier
    FROM roster_day_events rde
    WHERE rde.business_id = biz_id
    ORDER BY rde.date;
  ELSE
    RETURN QUERY
    SELECT rde.id, rde.date, rde.event_space, rde.event_type,
      rde.num_tables, rde.chairs_per_table, rde.tablecloth_color,
      rde.cold_sparkles, rde.dry_ice, rde.red_carpet,
      rde.decor_access, rde.notes, rde.adult_guests, rde.kids_guests,
      rde.smoke_machine, rde.live_stall, rde.live_stall_details,
      rde.host_name, rde.host_contact_number, rde.bev_package, rde.event_time,
      rde.runsheet_url, rde.banquet_tier
    FROM roster_day_events rde
    WHERE rde.business_id = biz_id
      AND rde.date IN (
        SELECT DISTINCT s.date FROM shifts s
        WHERE s.employee_id = emp_id AND s.status = 'published'
      )
    ORDER BY rde.date;
  END IF;
END;
$function$;