DROP POLICY IF EXISTS "Anyone can read delivery status logs" ON public.catering_delivery_status_logs;

CREATE POLICY "Business staff can read delivery status logs"
ON public.catering_delivery_status_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.catering_deliveries cd
    WHERE cd.id = catering_delivery_status_logs.delivery_id
      AND public.has_business_access(cd.business_id)
  )
);