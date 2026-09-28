CREATE OR REPLACE FUNCTION public.crm_sync_lead_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  matched_customer_id uuid;
  v_name text := lower(trim(COALESCE(NEW.full_name, '')));
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.crm_customers
    SET full_name = NEW.full_name,
        phone = COALESCE(NULLIF(NEW.phone, ''), phone),
        email = COALESCE(NULLIF(NEW.email, ''), email),
        company = COALESCE(NULLIF(NEW.company, ''), company),
        updated_at = now()
    WHERE id = NEW.customer_id AND business_id = NEW.business_id;
    IF FOUND THEN RETURN NEW; END IF;
    NEW.customer_id := NULL;
  END IF;

  SELECT c.id INTO matched_customer_id
  FROM public.crm_customers c
  WHERE c.business_id = NEW.business_id
    AND (
      (NULLIF(lower(trim(NEW.email)), '') IS NOT NULL AND lower(trim(c.email)) = lower(trim(NEW.email)))
      OR
      (NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), '') IS NOT NULL
       AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'))
    )
  ORDER BY c.created_at LIMIT 1;

  -- First-name-only contacts: merge on the same name
  IF matched_customer_id IS NULL AND v_name <> '' AND v_name !~ '\s' THEN
    SELECT c.id INTO matched_customer_id
    FROM public.crm_customers c
    WHERE c.business_id = NEW.business_id AND lower(trim(c.full_name)) = v_name
    ORDER BY c.created_at LIMIT 1;
  END IF;

  IF matched_customer_id IS NULL THEN
    INSERT INTO public.crm_customers (business_id, full_name, phone, email, company, source)
    VALUES (NEW.business_id, NEW.full_name, NEW.phone, NEW.email, NEW.company, 'lead')
    RETURNING id INTO matched_customer_id;
  ELSE
    UPDATE public.crm_customers
    SET full_name = NEW.full_name,
        phone = COALESCE(NULLIF(NEW.phone, ''), phone),
        email = COALESCE(NULLIF(NEW.email, ''), email),
        company = COALESCE(NULLIF(NEW.company, ''), company),
        updated_at = now()
    WHERE id = matched_customer_id;
  END IF;

  NEW.customer_id := matched_customer_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_merge_first_name_contacts(_business_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  merged integer := 0;
BEGIN
  IF NOT public.can_access_crm(_business_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  FOR r IN
    SELECT c.id, first_value(c.id) OVER (PARTITION BY lower(trim(c.full_name)) ORDER BY c.created_at, c.id) AS keep_id
    FROM public.crm_customers c
    WHERE c.business_id = _business_id AND trim(c.full_name) <> '' AND trim(c.full_name) !~ '\s'
  LOOP
    IF r.id <> r.keep_id THEN
      UPDATE public.crm_customers k SET
        phone = COALESCE(NULLIF(k.phone, ''), d.phone),
        email = COALESCE(NULLIF(k.email, ''), d.email),
        company = COALESCE(NULLIF(k.company, ''), d.company)
      FROM public.crm_customers d WHERE k.id = r.keep_id AND d.id = r.id;
      UPDATE public.crm_leads SET customer_id = r.keep_id WHERE customer_id = r.id;
      UPDATE public.crm_bookings SET customer_id = r.keep_id WHERE customer_id = r.id;
      DELETE FROM public.crm_customers WHERE id = r.id;
      merged := merged + 1;
    END IF;
  END LOOP;
  RETURN merged;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_merge_first_name_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_merge_first_name_contacts(uuid) TO authenticated;