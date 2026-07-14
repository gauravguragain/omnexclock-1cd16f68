
-- 1. Add ABN to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS abn text;

-- 2. Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  invoice_number integer NOT NULL,
  invoice_code text NOT NULL,
  net_hours numeric(10,2) NOT NULL DEFAULT 0,
  hourly_rate numeric(10,2) NOT NULL DEFAULT 30,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  employee_name text NOT NULL,
  employee_abn text,
  account_name text,
  bsb text,
  account_number text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_invoices_business_week ON public.invoices(business_id, week_start);
CREATE INDEX IF NOT EXISTS idx_invoices_employee ON public.invoices(employee_id, invoice_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Super admins of the business can manage invoices
CREATE POLICY "Super admins can view invoices"
ON public.invoices FOR SELECT TO authenticated
USING (public.is_super_admin_of_business(business_id));

CREATE POLICY "Super admins can insert invoices"
ON public.invoices FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin_of_business(business_id));

CREATE POLICY "Super admins can update invoices"
ON public.invoices FOR UPDATE TO authenticated
USING (public.is_super_admin_of_business(business_id))
WITH CHECK (public.is_super_admin_of_business(business_id));

CREATE POLICY "Super admins can delete invoices"
ON public.invoices FOR DELETE TO authenticated
USING (public.is_super_admin_of_business(business_id));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Next invoice number per employee
CREATE OR REPLACE FUNCTION public.next_employee_invoice_number(_employee_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(invoice_number), 0) + 1 FROM public.invoices WHERE employee_id = _employee_id;
$$;

-- 4. Employee self-serve RPCs (via employee_code)
CREATE OR REPLACE FUNCTION public.update_my_payment_details(
  _employee_code text,
  _business_code text,
  _abn text,
  _account_name text,
  _bsb text,
  _account_number text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_id uuid; biz_id uuid;
BEGIN
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN RETURN false; END IF;
  IF _business_code IS NULL OR _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN RETURN false; END IF;
  IF _abn IS NOT NULL AND LENGTH(regexp_replace(_abn, '\s', '', 'g')) NOT IN (0, 11) THEN RETURN false; END IF;

  SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT e.id INTO emp_id FROM employees e
   WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE employees
     SET abn = NULLIF(regexp_replace(COALESCE(_abn,''), '\s', '', 'g'), ''),
         account_name = NULLIF(TRIM(COALESCE(_account_name,'')), ''),
         bsb = NULLIF(TRIM(COALESCE(_bsb,'')), ''),
         account_number = NULLIF(TRIM(COALESCE(_account_number,'')), ''),
         updated_at = now()
   WHERE id = emp_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_payment_details(
  _employee_code text,
  _business_code text
) RETURNS TABLE(abn text, account_name text, bsb text, account_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE biz_id uuid;
BEGIN
  SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.abn, e.account_name, e.bsb, e.account_number FROM employees e
   WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
END; $$;
