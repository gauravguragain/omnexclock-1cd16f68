-- Allow anonymous users to check employee codes (limited columns)
CREATE POLICY "Anon can verify employee code"
ON public.employees
FOR SELECT
TO anon
USING (active = true);
