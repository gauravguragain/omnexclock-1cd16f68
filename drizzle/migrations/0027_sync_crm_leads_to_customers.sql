CREATE OR REPLACE FUNCTION public.crm_sync_lead_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_customer_id uuid;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.crm_customers
    SET full_name = NEW.full_name,
        phone = NEW.phone,
        email = NEW.email,
        company = NEW.company,
        updated_at = now()
    WHERE id = NEW.customer_id
      AND business_id = NEW.business_id;

    IF FOUND THEN
      RETURN NEW;
    END IF;

    NEW.customer_id := NULL;
  END IF;

  SELECT c.id
  INTO matched_customer_id
  FROM public.crm_customers c
  WHERE c.business_id = NEW.business_id
    AND (
      (NULLIF(lower(trim(NEW.email)), '') IS NOT NULL AND lower(trim(c.email)) = lower(trim(NEW.email)))
      OR
      (NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), '') IS NOT NULL
       AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'))
    )
  ORDER BY c.created_at
  LIMIT 1;

  IF matched_customer_id IS NULL THEN
    INSERT INTO public.crm_customers (business_id, full_name, phone, email, company, source)
    VALUES (NEW.business_id, NEW.full_name, NEW.phone, NEW.email, NEW.company, 'lead')
    RETURNING id INTO matched_customer_id;
  ELSE
    UPDATE public.crm_customers
    SET full_name = NEW.full_name,
        phone = NEW.phone,
        email = NEW.email,
        company = NEW.company,
        updated_at = now()
    WHERE id = matched_customer_id;
  END IF;

  NEW.customer_id := matched_customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_sync_lead_customer_trigger ON public.crm_leads;
CREATE TRIGGER crm_sync_lead_customer_trigger
BEFORE INSERT OR UPDATE OF full_name, phone, email, company, customer_id
ON public.crm_leads
FOR EACH ROW
EXECUTE FUNCTION public.crm_sync_lead_customer();

UPDATE public.crm_leads
SET full_name = full_name
WHERE customer_id IS NULL;

UPDATE public.crm_bookings b
SET customer_id = l.customer_id
FROM public.crm_leads l
WHERE b.lead_id = l.id
  AND b.customer_id IS NULL
  AND l.customer_id IS NOT NULL;