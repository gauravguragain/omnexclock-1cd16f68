-- Fix shifts table RLS policies: change from RESTRICTIVE to PERMISSIVE
-- This is needed because with only RESTRICTIVE policies and no PERMISSIVE ones,
-- PostgreSQL denies all access by default.

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage own business shifts" ON public.shifts;
DROP POLICY IF EXISTS "Roster admins can manage department shifts" ON public.shifts;
DROP POLICY IF EXISTS "Employees can view own published shifts" ON public.shifts;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Admins can manage own business shifts"
ON public.shifts
FOR ALL
USING (is_admin_of_business(get_employee_business_id(employee_id)))
WITH CHECK (is_admin_of_business(get_employee_business_id(employee_id)));

CREATE POLICY "Roster admins can manage department shifts"
ON public.shifts
FOR ALL
USING (
  is_roster_admin_of_business(get_employee_business_id(employee_id))
  AND (
    (SELECT employees.department FROM employees WHERE employees.id = shifts.employee_id)
    = ANY (get_roster_admin_departments(get_employee_business_id(employee_id)))
  )
)
WITH CHECK (
  is_roster_admin_of_business(get_employee_business_id(employee_id))
  AND (
    (SELECT employees.department FROM employees WHERE employees.id = shifts.employee_id)
    = ANY (get_roster_admin_departments(get_employee_business_id(employee_id)))
  )
);

CREATE POLICY "Employees can view own published shifts"
ON public.shifts
FOR SELECT
USING (status = 'published');