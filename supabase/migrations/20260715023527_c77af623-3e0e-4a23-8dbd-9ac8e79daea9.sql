
-- Category enum-like via check
CREATE TABLE public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('rsa','food_handling','photo_id','visa','other')),
  custom_label TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  admin_note TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_documents_employee ON public.employee_documents(employee_id);
CREATE INDEX idx_employee_documents_business ON public.employee_documents(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view business documents" ON public.employee_documents
  FOR SELECT TO authenticated
  USING (public.has_business_access(business_id));

CREATE POLICY "Admins update business documents" ON public.employee_documents
  FOR UPDATE TO authenticated
  USING (public.is_admin_of_business(business_id))
  WITH CHECK (public.is_admin_of_business(business_id));

CREATE POLICY "Admins delete business documents" ON public.employee_documents
  FOR DELETE TO authenticated
  USING (public.is_admin_of_business(business_id));

CREATE POLICY "Admins insert business documents" ON public.employee_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_of_business(business_id));

CREATE TRIGGER update_employee_documents_updated_at
  BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPCs

CREATE OR REPLACE FUNCTION public.get_my_employee_documents(_employee_code text, _business_code text)
RETURNS TABLE(
  id uuid, category text, custom_label text, file_name text, file_path text,
  file_size bigint, mime_type text, expiry_date date, status text, admin_note text,
  created_at timestamptz, verified_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE emp_id uuid; biz_id uuid;
BEGIN
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN RETURN; END IF;
  IF _business_code IS NULL OR _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN RETURN; END IF;
  SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT e.id INTO emp_id FROM employees e
    WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT d.id, d.category, d.custom_label, d.file_name, d.file_path,
         d.file_size, d.mime_type, d.expiry_date, d.status, d.admin_note,
         d.created_at, d.verified_at
  FROM employee_documents d
  WHERE d.employee_id = emp_id
  ORDER BY d.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.insert_my_employee_document(
  _employee_code text, _business_code text, _category text, _custom_label text,
  _file_path text, _file_name text, _file_size bigint, _mime_type text, _expiry_date date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE emp_id uuid; biz_id uuid; new_id uuid;
BEGIN
  IF _employee_code IS NULL OR _employee_code !~ '^[0-9A-Za-z\-]{1,20}$' THEN RETURN NULL; END IF;
  IF _business_code IS NULL OR _business_code !~ '^[0-9A-Za-z\-]{1,50}$' THEN RETURN NULL; END IF;
  IF _category NOT IN ('rsa','food_handling','photo_id','visa','other') THEN RETURN NULL; END IF;
  IF _file_size IS NOT NULL AND _file_size > 10485760 THEN RETURN NULL; END IF;

  SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT e.id INTO emp_id FROM employees e
    WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO employee_documents(employee_id, business_id, category, custom_label,
    file_path, file_name, file_size, mime_type, expiry_date)
  VALUES (emp_id, biz_id, _category, NULLIF(TRIM(COALESCE(_custom_label,'')),''),
    _file_path, _file_name, _file_size, _mime_type, _expiry_date)
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_my_employee_document(
  _employee_code text, _business_code text, _doc_id uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE emp_id uuid; biz_id uuid; doc RECORD;
BEGIN
  SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT e.id INTO emp_id FROM employees e
    WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO doc FROM employee_documents WHERE id = _doc_id AND employee_id = emp_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF doc.status = 'verified' THEN RETURN NULL; END IF;

  DELETE FROM employee_documents WHERE id = _doc_id;
  RETURN doc.file_path;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_document_status(
  _doc_id uuid, _status text, _note text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE biz uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _status NOT IN ('pending','verified','rejected') THEN RETURN false; END IF;
  SELECT business_id INTO biz FROM employee_documents WHERE id = _doc_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT is_admin_of_business(biz) THEN RETURN false; END IF;

  UPDATE employee_documents
     SET status = _status,
         admin_note = NULLIF(TRIM(COALESCE(_note,'')),''),
         verified_by = CASE WHEN _status = 'verified' THEN auth.uid() ELSE verified_by END,
         verified_at = CASE WHEN _status = 'verified' THEN now() ELSE verified_at END,
         updated_at = now()
   WHERE id = _doc_id;
  RETURN true;
END; $$;

-- Storage policies for employee-documents bucket
-- Path convention: {business_id}/{employee_id}/{uuid}-{filename}
CREATE POLICY "Admins read business docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND public.has_business_access(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Admins insert business docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND public.is_admin_of_business(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Admins delete business docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND public.is_admin_of_business(((storage.foldername(name))[1])::uuid)
  );
