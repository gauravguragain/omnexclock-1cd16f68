
CREATE OR REPLACE FUNCTION public.get_employee_invoices(_employee_code text, _business_code text)
RETURNS TABLE(
  id uuid,
  invoice_number integer,
  invoice_code text,
  week_start date,
  week_end date,
  issue_date date,
  due_date date,
  net_hours numeric,
  hourly_rate numeric,
  amount numeric,
  employee_name text,
  employee_abn text,
  account_name text,
  bsb text,
  account_number text,
  business_name text,
  business_code text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_id uuid;
  biz_id uuid;
  biz_name text;
  biz_code text;
BEGIN
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN RETURN; END IF;
  IF _business_code IS NULL OR _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN RETURN; END IF;

  SELECT b.id, b.name, b.business_code INTO biz_id, biz_name, biz_code
    FROM businesses b WHERE b.business_code = _business_code;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT e.id INTO emp_id FROM employees e
   WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.invoice_number, i.invoice_code, i.week_start, i.week_end,
         i.issue_date, i.due_date, i.net_hours, i.hourly_rate, i.amount,
         i.employee_name, i.employee_abn, i.account_name, i.bsb, i.account_number,
         biz_name, biz_code, i.created_at
    FROM invoices i
   WHERE i.employee_id = emp_id AND i.business_id = biz_id
   ORDER BY i.week_start DESC, i.invoice_number DESC;
END;
$$;
