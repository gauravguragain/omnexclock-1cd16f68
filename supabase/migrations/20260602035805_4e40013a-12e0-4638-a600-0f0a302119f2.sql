DROP POLICY IF EXISTS "Users can view their business" ON public.businesses;

CREATE POLICY "Users can view their assigned businesses"
ON public.businesses
FOR SELECT
USING (
  owner_id = auth.uid()
  OR public.has_business_access(id)
);