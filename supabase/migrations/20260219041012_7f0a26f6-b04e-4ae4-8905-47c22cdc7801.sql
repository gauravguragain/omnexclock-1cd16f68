-- Drop global unique constraint on employee_code
ALTER TABLE public.employees DROP CONSTRAINT employees_employee_code_key;

-- Add composite unique constraint scoped to business
ALTER TABLE public.employees ADD CONSTRAINT employees_employee_code_business_unique UNIQUE (employee_code, business_id);