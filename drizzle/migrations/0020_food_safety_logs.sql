CREATE TABLE public.fsl_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  form_type text NOT NULL DEFAULT 'event_log',
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fsl_forms TO authenticated;
GRANT ALL ON public.fsl_forms TO service_role;
ALTER TABLE public.fsl_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsl forms read" ON public.fsl_forms FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "fsl forms write" ON public.fsl_forms FOR ALL TO authenticated USING (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id));

CREATE TABLE public.fsl_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.fsl_forms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  version int NOT NULL,
  config jsonb NOT NULL,
  template_path text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fsl_form_versions TO authenticated;
GRANT ALL ON public.fsl_form_versions TO service_role;
ALTER TABLE public.fsl_form_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsl versions read" ON public.fsl_form_versions FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "fsl versions write" ON public.fsl_form_versions FOR ALL TO authenticated USING (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id));

CREATE TABLE public.fsl_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  supervisor_employee_ids uuid[] NOT NULL DEFAULT '{}',
  alert_emails text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fsl_settings TO authenticated;
GRANT ALL ON public.fsl_settings TO service_role;
ALTER TABLE public.fsl_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsl settings read" ON public.fsl_settings FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "fsl settings write" ON public.fsl_settings FOR ALL TO authenticated USING (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id));

CREATE TABLE public.fsl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.fsl_forms(id) ON DELETE CASCADE,
  form_version int NOT NULL DEFAULT 1,
  client_id text UNIQUE,
  entry_date date NOT NULL,
  period_key text NOT NULL,
  section_key text,
  check_key text,
  header_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'complete',
  out_of_range boolean NOT NULL DEFAULT false,
  alert_sent boolean NOT NULL DEFAULT false,
  backfilled boolean NOT NULL DEFAULT false,
  edited boolean NOT NULL DEFAULT false,
  employee_id uuid,
  staff_name text,
  admin_user_id uuid,
  finished_employee_id uuid,
  finished_by_name text,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fsl_entries_form_period ON public.fsl_entries(form_id, period_key);
CREATE INDEX fsl_entries_biz_date ON public.fsl_entries(business_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fsl_entries TO authenticated;
GRANT ALL ON public.fsl_entries TO service_role;
ALTER TABLE public.fsl_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsl entries read" ON public.fsl_entries FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "fsl entries write" ON public.fsl_entries FOR ALL TO authenticated USING (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id));

CREATE TABLE public.fsl_entry_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.fsl_entries(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  old_value text,
  new_value text,
  changed_by text NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fsl_entry_audit TO authenticated;
GRANT ALL ON public.fsl_entry_audit TO service_role;
ALTER TABLE public.fsl_entry_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsl audit read" ON public.fsl_entry_audit FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "fsl audit insert" ON public.fsl_entry_audit FOR INSERT TO authenticated WITH CHECK (public.is_admin_of_business(business_id) OR public.is_super_admin_of_business(business_id));

CREATE OR REPLACE FUNCTION public.fsl_resolve_staff(_code text, _business_code text)
RETURNS TABLE(employee_id uuid, employee_name text, business_id uuid, is_supervisor boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.name, b.id, COALESCE(e.id = ANY(s.supervisor_employee_ids), false)
  FROM public.businesses b
  JOIN public.employees e ON e.business_id = b.id AND e.employee_code = btrim(_code) AND e.active
  LEFT JOIN public.fsl_settings s ON s.business_id = b.id
  WHERE upper(b.business_code) = upper(btrim(_business_code))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.fsl_resolve_staff(text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fsl_staff_login(_code text, _business_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.fsl_resolve_staff(_code, _business_code);
  IF r.employee_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('employee_id', r.employee_id, 'name', r.employee_name, 'business_id', r.business_id, 'is_supervisor', r.is_supervisor,
    'business_name', (SELECT name FROM public.businesses WHERE id = r.business_id));
END $$;

CREATE OR REPLACE FUNCTION public.fsl_staff_data(_code text, _business_code text, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.fsl_resolve_staff(_code, _business_code);
  IF r.employee_id IS NULL THEN RAISE EXCEPTION 'Invalid staff PIN'; END IF;
  RETURN jsonb_build_object(
    'forms', COALESCE((SELECT jsonb_agg(to_jsonb(f) - 'template_path' ORDER BY f.sort_order, f.name) FROM public.fsl_forms f WHERE f.business_id = r.business_id AND f.active), '[]'::jsonb),
    'entries', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.fsl_entries x WHERE x.business_id = r.business_id AND ((x.entry_date BETWEEN _from AND _to) OR x.status = 'open')), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.fsl_staff_save(_code text, _business_code text, _entry jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; f record; today date := (now() AT TIME ZONE 'Australia/Sydney')::date; d date; row_out public.fsl_entries;
BEGIN
  SELECT * INTO r FROM public.fsl_resolve_staff(_code, _business_code);
  IF r.employee_id IS NULL THEN RAISE EXCEPTION 'Invalid staff PIN'; END IF;
  SELECT * INTO f FROM public.fsl_forms WHERE id = (_entry->>'form_id')::uuid AND business_id = r.business_id AND active;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Form not found'; END IF;
  d := COALESCE((_entry->>'entry_date')::date, today);
  IF d > today OR d < today - 1 THEN d := today; END IF;
  IF _entry->>'client_id' IS NOT NULL THEN
    SELECT * INTO row_out FROM public.fsl_entries WHERE client_id = _entry->>'client_id';
    IF row_out.id IS NOT NULL THEN RETURN to_jsonb(row_out); END IF;
  END IF;
  INSERT INTO public.fsl_entries(business_id, form_id, form_version, client_id, entry_date, period_key, section_key, check_key, header_values, field_values, status, out_of_range, employee_id, staff_name)
  VALUES (r.business_id, f.id, f.version, _entry->>'client_id', d, COALESCE(_entry->>'period_key', to_char(d,'YYYY-MM')), _entry->>'section_key', _entry->>'check_key',
    COALESCE(_entry->'header_values','{}'::jsonb), COALESCE(_entry->'field_values','{}'::jsonb), COALESCE(_entry->>'status','complete'), COALESCE((_entry->>'out_of_range')::boolean,false), r.employee_id, r.employee_name)
  RETURNING * INTO row_out;
  RETURN to_jsonb(row_out);
END $$;

CREATE OR REPLACE FUNCTION public.fsl_staff_finish(_code text, _business_code text, _entry_id uuid, _values jsonb, _out_of_range boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; row_out public.fsl_entries;
BEGIN
  SELECT * INTO r FROM public.fsl_resolve_staff(_code, _business_code);
  IF r.employee_id IS NULL THEN RAISE EXCEPTION 'Invalid staff PIN'; END IF;
  UPDATE public.fsl_entries SET field_values = field_values || COALESCE(_values,'{}'::jsonb), status = 'complete', out_of_range = out_of_range OR COALESCE(_out_of_range,false),
    finished_employee_id = r.employee_id, finished_by_name = r.employee_name, finished_at = now(), updated_at = now(), alert_sent = false
  WHERE id = _entry_id AND business_id = r.business_id AND status = 'open' RETURNING * INTO row_out;
  IF row_out.id IS NULL THEN RAISE EXCEPTION 'Entry is not open'; END IF;
  RETURN to_jsonb(row_out);
END $$;

CREATE OR REPLACE FUNCTION public.fsl_staff_edit(_code text, _business_code text, _entry_id uuid, _values jsonb, _out_of_range boolean, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; old public.fsl_entries; row_out public.fsl_entries; k text;
BEGIN
  SELECT * INTO r FROM public.fsl_resolve_staff(_code, _business_code);
  IF r.employee_id IS NULL OR NOT r.is_supervisor THEN RAISE EXCEPTION 'Only supervisors can edit entries'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO old FROM public.fsl_entries WHERE id = _entry_id AND business_id = r.business_id;
  IF old.id IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  FOR k IN SELECT jsonb_object_keys(_values) LOOP
    IF (old.field_values->k) IS DISTINCT FROM (_values->k) THEN
      INSERT INTO public.fsl_entry_audit(business_id, entry_id, field_key, old_value, new_value, changed_by, reason)
      VALUES (r.business_id, old.id, k, old.field_values->>k, _values->>k, r.employee_name || ' (supervisor)', _reason);
    END IF;
  END LOOP;
  UPDATE public.fsl_entries SET field_values = field_values || _values, out_of_range = COALESCE(_out_of_range, out_of_range), edited = true, updated_at = now()
  WHERE id = old.id RETURNING * INTO row_out;
  RETURN to_jsonb(row_out);
END $$;

GRANT EXECUTE ON FUNCTION public.fsl_staff_login(text,text), public.fsl_staff_data(text,text,date,date), public.fsl_staff_save(text,text,jsonb), public.fsl_staff_finish(text,text,uuid,jsonb,boolean), public.fsl_staff_edit(text,text,uuid,jsonb,boolean,text) TO anon, authenticated;

CREATE POLICY "fsl templates read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fsl-templates' AND public.has_business_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "fsl templates insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fsl-templates' AND public.is_admin_of_business(((storage.foldername(name))[1])::uuid));
CREATE POLICY "fsl templates update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'fsl-templates' AND public.is_admin_of_business(((storage.foldername(name))[1])::uuid));