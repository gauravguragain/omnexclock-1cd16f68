
-- Config table: stores admin-defined options for event setup per business
-- config_type values: 'event_space', 'event_type'
CREATE TABLE public.event_setup_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  config_type TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id, config_type, label)
);

ALTER TABLE public.event_setup_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own business event config"
ON public.event_setup_config FOR ALL
USING (is_admin_of_business(business_id))
WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Viewers can view own business event config"
ON public.event_setup_config FOR SELECT
USING (has_business_access(business_id));

CREATE POLICY "Anon can read event config"
ON public.event_setup_config FOR SELECT
USING (true);

-- Roster day events: stores actual event entries per day per business
CREATE TABLE public.roster_day_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  event_space TEXT,
  event_type TEXT,
  num_tables INT DEFAULT 0,
  chairs_per_table INT DEFAULT 0,
  tablecloth_color TEXT DEFAULT 'white',
  cold_sparkles BOOLEAN DEFAULT false,
  dry_ice BOOLEAN DEFAULT false,
  red_carpet BOOLEAN DEFAULT false,
  decor_access BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.roster_day_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own business day events"
ON public.roster_day_events FOR ALL
USING (is_admin_of_business(business_id))
WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Viewers can view own business day events"
ON public.roster_day_events FOR SELECT
USING (has_business_access(business_id));

CREATE POLICY "Anon can read day events"
ON public.roster_day_events FOR SELECT
USING (true);

CREATE INDEX idx_roster_day_events_biz_date ON public.roster_day_events(business_id, date);
CREATE INDEX idx_event_setup_config_biz ON public.event_setup_config(business_id, config_type);

-- RPC for employees to get day events for dates they have shifts
CREATE OR REPLACE FUNCTION public.get_employee_day_events(_employee_code text, _business_code text DEFAULT NULL)
RETURNS TABLE(
  id uuid, date date, event_space text, event_type text,
  num_tables int, chairs_per_table int, tablecloth_color text,
  cold_sparkles boolean, dry_ice boolean, red_carpet boolean,
  decor_access boolean, notes text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    SELECT e.business_id INTO biz_id FROM employees e WHERE e.id = emp_id;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT rde.id, rde.date, rde.event_space, rde.event_type,
    rde.num_tables, rde.chairs_per_table, rde.tablecloth_color,
    rde.cold_sparkles, rde.dry_ice, rde.red_carpet,
    rde.decor_access, rde.notes
  FROM roster_day_events rde
  WHERE rde.business_id = biz_id
    AND rde.date IN (
      SELECT DISTINCT s.date FROM shifts s
      WHERE s.employee_id = emp_id AND s.status = 'published'
    )
  ORDER BY rde.date;
END;
$$;
