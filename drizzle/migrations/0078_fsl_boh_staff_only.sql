CREATE OR REPLACE FUNCTION public.fsl_resolve_staff(_code text, _business_code text)
 RETURNS TABLE(employee_id uuid, employee_name text, business_id uuid, is_supervisor boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, b.id, COALESCE(e.id = ANY(s.supervisor_employee_ids), false)
  FROM public.businesses b
  JOIN public.employees e ON e.business_id = b.id AND btrim(e.employee_code) = btrim(_code) AND e.active
  LEFT JOIN public.fsl_settings s ON s.business_id = b.id
  WHERE upper(b.business_code) = upper(btrim(_business_code))
    AND (upper(btrim(coalesce(e.department,''))) = 'BOH' OR COALESCE(e.id = ANY(s.supervisor_employee_ids), false))
  LIMIT 1
$function$;