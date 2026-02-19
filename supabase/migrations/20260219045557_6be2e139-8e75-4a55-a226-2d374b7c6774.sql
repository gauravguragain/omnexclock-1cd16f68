
-- Allow master admin to view all employees (count only, no sensitive data exposed in UI)
CREATE POLICY "Master can view all employees"
  ON public.employees FOR SELECT
  USING (is_master());
