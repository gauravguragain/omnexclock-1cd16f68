
-- Create restricted public view for businesses (excludes email, phone, owner_id, address, description, industry)
CREATE VIEW public.businesses_public AS
  SELECT id, business_code, name, logo_url, theme, status
  FROM public.businesses;

-- Create restricted public view for employees (excludes email, phone, pay_rate, admin_hourly_rate)
CREATE VIEW public.employees_public AS
  SELECT id, employee_code, name, department, job_title, business_id, active
  FROM public.employees;

-- Grant SELECT on views to anon and authenticated roles
GRANT SELECT ON public.businesses_public TO anon, authenticated;
GRANT SELECT ON public.employees_public TO anon, authenticated;

-- Drop the overly permissive public SELECT policies
DROP POLICY "Public can read business by code" ON public.businesses;
DROP POLICY "Anon can verify employee code" ON public.employees;
