
-- Create catering_deliveries table
CREATE TABLE public.catering_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  delivery_time TEXT,
  delivery_address TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  contact_number TEXT,
  number_of_guests INTEGER NOT NULL DEFAULT 0,
  driver_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  cost_incl_gst NUMERIC NOT NULL DEFAULT 40.00,
  cost_excl_gst NUMERIC NOT NULL DEFAULT 36.36,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create status log table
CREATE TABLE public.catering_delivery_status_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES public.catering_deliveries(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  updated_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.catering_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catering_delivery_status_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for catering_deliveries
CREATE POLICY "Admins can manage own business deliveries"
  ON public.catering_deliveries FOR ALL TO authenticated
  USING (is_admin_of_business(business_id))
  WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Super admins can manage own business deliveries"
  ON public.catering_deliveries FOR ALL TO public
  USING (is_super_admin_of_business(business_id))
  WITH CHECK (is_super_admin_of_business(business_id));

CREATE POLICY "Roster admins can view own business deliveries"
  ON public.catering_deliveries FOR SELECT TO public
  USING (is_roster_admin_of_business(business_id));

CREATE POLICY "Viewers can view own business deliveries"
  ON public.catering_deliveries FOR SELECT TO public
  USING (has_business_access(business_id));

-- RLS policies for status logs
CREATE POLICY "Admins can manage delivery status logs"
  ON public.catering_delivery_status_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM catering_deliveries cd WHERE cd.id = delivery_id AND is_admin_of_business(cd.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM catering_deliveries cd WHERE cd.id = delivery_id AND is_admin_of_business(cd.business_id)));

CREATE POLICY "Anyone can read delivery status logs"
  ON public.catering_delivery_status_logs FOR SELECT TO public
  USING (true);

CREATE POLICY "Service role can insert status logs"
  ON public.catering_delivery_status_logs FOR INSERT TO public
  WITH CHECK (true);

-- RPC for employee portal to get their deliveries
CREATE OR REPLACE FUNCTION public.get_employee_deliveries(_employee_code TEXT, _business_code TEXT DEFAULT NULL)
RETURNS TABLE(
  delivery_id UUID, delivery_date DATE, delivery_time TEXT, delivery_address TEXT, contact_person TEXT,
  contact_number TEXT, number_of_guests INTEGER, delivery_status TEXT, delivery_notes TEXT,
  cost_incl_gst NUMERIC, cost_excl_gst NUMERIC, delivery_created_at TIMESTAMPTZ
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
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT cd.id, cd.delivery_date, cd.delivery_time, cd.delivery_address, cd.contact_person,
    cd.contact_number, cd.number_of_guests, cd.status, cd.notes,
    cd.cost_incl_gst, cd.cost_excl_gst, cd.created_at
  FROM catering_deliveries cd
  WHERE cd.driver_id = emp_id
  ORDER BY cd.delivery_date DESC, cd.delivery_time DESC;
END;
$$;

-- RPC for employee to update delivery status
CREATE OR REPLACE FUNCTION public.update_delivery_status(
  _employee_code TEXT, _delivery_id UUID, _status TEXT, _notes TEXT DEFAULT NULL, _business_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  biz_id UUID;
  del_driver UUID;
BEGIN
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN RETURN false; END IF;
  IF _status NOT IN ('pending', 'picked_up', 'on_the_way', 'delivered') THEN RETURN false; END IF;

  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT cd.driver_id INTO del_driver FROM catering_deliveries cd WHERE cd.id = _delivery_id;
  IF del_driver IS NULL OR del_driver != emp_id THEN RETURN false; END IF;

  UPDATE catering_deliveries SET status = _status, updated_at = now() WHERE id = _delivery_id;

  INSERT INTO catering_delivery_status_logs (delivery_id, status, updated_by, notes)
  VALUES (_delivery_id, _status, emp_id, _notes);

  RETURN true;
END;
$$;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.catering_deliveries;
