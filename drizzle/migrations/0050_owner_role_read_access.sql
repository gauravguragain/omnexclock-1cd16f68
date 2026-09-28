CREATE OR REPLACE FUNCTION public.is_owner_of_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = _business_id
      AND role::text IN ('owner','super_admin')
  )
$function$;

CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = _business_id
      AND role::text IN ('admin','super_admin','viewer','roster_admin','sales_marketing_manager','food_safety_manager','owner')
  )
$function$;

CREATE POLICY "Owners can view leads" ON public.crm_leads
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view bookings" ON public.crm_bookings
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view payments" ON public.crm_payments
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view inspections" ON public.crm_inspections
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view tasks" ON public.crm_tasks
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view inventory orders" ON public.inventory_orders
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view bar inventory orders" ON public.bar_inventory_orders
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (public.is_owner_of_business(business_id));

CREATE POLICY "Owners can view shifts" ON public.shifts
  FOR SELECT TO authenticated USING (public.is_owner_of_business(public.get_employee_business_id(employee_id)));

CREATE POLICY "Owners can view employee requests" ON public.employee_requests
  FOR SELECT TO authenticated USING (public.is_owner_of_business(public.get_employee_business_id(employee_id)));
