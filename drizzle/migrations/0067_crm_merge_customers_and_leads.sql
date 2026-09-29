CREATE OR REPLACE FUNCTION public.crm_merge_customers(_keep_id uuid, _merge_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE biz uuid; d record; n integer := 0;
BEGIN
  SELECT business_id INTO biz FROM crm_customers WHERE id = _keep_id;
  IF biz IS NULL OR NOT public.can_access_crm(biz) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  FOR d IN SELECT * FROM crm_customers WHERE id = ANY(_merge_ids) AND id <> _keep_id AND business_id = biz LOOP
    UPDATE crm_customers k SET
      phone = COALESCE(NULLIF(k.phone,''), d.phone),
      email = COALESCE(NULLIF(k.email,''), d.email),
      address = COALESCE(NULLIF(k.address,''), d.address),
      company = COALESCE(NULLIF(k.company,''), d.company),
      notes = CASE WHEN COALESCE(d.notes,'') = '' OR COALESCE(k.notes,'') = d.notes THEN k.notes
                   WHEN COALESCE(k.notes,'') = '' THEN d.notes ELSE k.notes || E'\n' || d.notes END,
      updated_at = now()
    WHERE k.id = _keep_id;
    UPDATE crm_leads SET customer_id = _keep_id WHERE customer_id = d.id;
    UPDATE crm_bookings SET customer_id = _keep_id WHERE customer_id = d.id;
    UPDATE crm_menu_sends SET customer_id = _keep_id WHERE customer_id = d.id;
    DELETE FROM crm_customers WHERE id = d.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.crm_merge_leads(_keep_id uuid, _merge_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE biz uuid; d record; n integer := 0;
BEGIN
  SELECT business_id INTO biz FROM crm_leads WHERE id = _keep_id;
  IF biz IS NULL OR NOT public.can_access_crm(biz) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  FOR d IN SELECT * FROM crm_leads WHERE id = ANY(_merge_ids) AND id <> _keep_id AND business_id = biz LOOP
    IF EXISTS (SELECT 1 FROM crm_bookings WHERE lead_id = d.id) AND EXISTS (SELECT 1 FROM crm_bookings WHERE lead_id = _keep_id) THEN
      RAISE EXCEPTION 'Leads for % both have their own event, so they are separate events and cannot be merged. Merge the customers instead.', d.full_name;
    END IF;
    IF EXISTS (SELECT 1 FROM crm_menu_selections WHERE lead_id = d.id) AND EXISTS (SELECT 1 FROM crm_menu_selections WHERE lead_id = _keep_id) THEN
      RAISE EXCEPTION 'Leads for % both have a saved menu, so they cannot be merged.', d.full_name;
    END IF;
    IF EXISTS (SELECT 1 FROM crm_runsheets WHERE lead_id = d.id) AND EXISTS (SELECT 1 FROM crm_runsheets WHERE lead_id = _keep_id) THEN
      RAISE EXCEPTION 'Leads for % both have a run sheet, so they cannot be merged.', d.full_name;
    END IF;
    UPDATE crm_leads k SET
      phone = COALESCE(NULLIF(k.phone,''), d.phone),
      email = COALESCE(NULLIF(k.email,''), d.email),
      company = COALESCE(NULLIF(k.company,''), d.company),
      customer_id = COALESCE(k.customer_id, d.customer_id),
      estimated_guest_count = COALESCE(k.estimated_guest_count, d.estimated_guest_count),
      venue_space = COALESCE(NULLIF(k.venue_space,''), d.venue_space),
      preferred_dates = CASE WHEN COALESCE(array_length(k.preferred_dates,1),0) = 0 THEN d.preferred_dates ELSE k.preferred_dates END,
      tags = ARRAY(SELECT DISTINCT unnest(COALESCE(k.tags,'{}') || COALESCE(d.tags,'{}'))),
      updated_at = now()
    WHERE k.id = _keep_id;
    UPDATE crm_bookings SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_menu_selections SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_runsheets SET lead_id = _keep_id WHERE lead_id = d.id;
    DELETE FROM crm_lead_stakeholders s WHERE s.lead_id = d.id AND EXISTS (SELECT 1 FROM crm_lead_stakeholders k WHERE k.lead_id = _keep_id AND k.stakeholder_id = s.stakeholder_id);
    UPDATE crm_lead_stakeholders SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_tasks SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_interactions SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_inspections SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_timeline_events SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_guest_menu_links SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_menu_sends SET lead_id = _keep_id WHERE lead_id = d.id;
    DELETE FROM crm_leads WHERE id = d.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.crm_merge_customers(uuid, uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.crm_merge_leads(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.crm_merge_customers(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_merge_leads(uuid, uuid[]) TO authenticated;