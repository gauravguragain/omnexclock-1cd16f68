
-- Add the missing time columns to employee_requests
ALTER TABLE public.employee_requests
ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS end_time TIME WITHOUT TIME ZONE DEFAULT NULL;
