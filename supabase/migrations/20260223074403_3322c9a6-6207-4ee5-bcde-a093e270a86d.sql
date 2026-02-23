
-- Add pay/bank detail columns to employees table
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pay_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS account_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bsb text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS account_number text DEFAULT NULL;
